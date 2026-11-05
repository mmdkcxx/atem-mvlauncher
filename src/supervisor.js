const { EventEmitter } = require('node:events')

const DEFAULT_TIMINGS = Object.freeze({
  connectMs: 5000,
  notFoundAfterMs: 20000,
  retryMs: 3000,
  outputRetryMs: 30000,
})

// Keeps one live ATEM session: finds the ATEM, checks/sets the outputs, and starts
// over when the connection is lost. A fresh Atem instance is used for every attempt
// and destroyed afterwards, so atem-connection's own socket reconnect never matters.
class Supervisor extends EventEmitter {
  #deps
  #t
  #running = false
  #runPromise = null
  #wake = null
  #endSession = null
  #current = null // { atem, address } of the live session
  #adopted = null // { atem, address } handed over by tryAddress
  #notFound = false
  #outputWarning = false

  constructor(deps) {
    super()
    this.#deps = deps
    this.#t = { ...DEFAULT_TIMINGS, ...deps.timings }
  }

  start() {
    if (this.#running) return
    this.#running = true
    this.#runPromise = this.#supervise()
  }

  async stop() {
    this.#running = false
    this.#wake?.()
    this.#endSession?.()
    if (this.#adopted) {
      const { atem } = this.#adopted
      this.#adopted = null
      await this.#destroy(atem)
    }
    await this.#runPromise
    this.#runPromise = null
  }

  async tryAddress(address) {
    if (this.#current?.address === address) return true
    const atem = await this.#attempt(address)
    if (!atem) return false
    if (!this.#running) {
      await this.#destroy(atem)
      return false
    }
    if (this.#adopted) await this.#destroy(this.#adopted.atem)
    this.#adopted = { atem, address }
    this.#wake?.()
    this.#endSession?.()
    return true
  }

  #set(state, address) {
    if (!this.#running) return
    const payload = { state, outputWarning: this.#outputWarning }
    if (address) payload.address = address
    this.emit('state', payload)
  }

  // An unexpected throw must never end the supervisor: report it and start over.
  async #supervise() {
    while (this.#running) {
      try {
        await this.#run()
      } catch (err) {
        this.#fault(err)
        if (this.#running) await this.#sleep(this.#t.retryMs)
      }
    }
  }

  #fault(err) {
    this.emit('fault', err instanceof Error ? err : new Error(String(err)))
  }

  async #run() {
    while (this.#running) {
      const connection = await this.#findConnection()
      if (!connection) return
      this.#current = connection
      try {
        await this.#session(connection)
      } finally {
        this.#current = null
        await this.#destroy(connection.atem)
      }
    }
  }

  async #findConnection() {
    this.#notFound = false
    this.#outputWarning = false
    this.#set('searching')
    const notFoundTimer = setTimeout(() => {
      this.#notFound = true
      if (!this.#current) this.#set('not-found')
    }, this.#t.notFoundAfterMs)
    try {
      while (this.#running) {
        if (this.#adopted) {
          const adopted = this.#adopted
          this.#adopted = null
          return adopted
        }
        let candidates = []
        try {
          candidates = await this.#deps.getCandidates()
        } catch {
          // no candidates this round; try again after the pause
        }
        for (const { address } of candidates) {
          if (!this.#running || this.#adopted) break
          if (!this.#notFound) this.#set('connecting', address)
          const atem = await this.#attempt(address)
          if (!atem) continue
          if (!this.#running) {
            await this.#destroy(atem)
            return null
          }
          return { atem, address }
        }
        if (this.#adopted) continue
        this.#set(this.#notFound ? 'not-found' : 'searching')
        await this.#sleep(this.#t.retryMs)
      }
      return null
    } finally {
      clearTimeout(notFoundTimer)
    }
  }

  // Success means the 'connected' event (initial state received), not connect() resolving.
  async #attempt(address) {
    const atem = this.#deps.createAtem()
    atem.on('error', () => {})
    const connected = new Promise((resolve) => atem.once('connected', () => resolve(true)))
    const connectFailed = Promise.resolve()
      .then(() => atem.connect(address))
      .then(
        () => new Promise(() => {}),
        () => false,
      )
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), this.#t.connectMs)
    })
    const ok = await Promise.race([connected, connectFailed, timeout])
    clearTimeout(timer)
    if (!ok) {
      await this.#destroy(atem)
      return null
    }
    return atem
  }

  async #session({ atem, address }) {
    try {
      this.#deps.onConnected(address)
    } catch (err) {
      this.#fault(err)
    }
    let ended = false
    let finish
    const endedPromise = new Promise((resolve) => {
      finish = () => {
        ended = true
        resolve()
      }
    })
    this.#endSession = finish
    atem.once('disconnected', finish)
    // The 'disconnected' event can fire while a session is being handed over; 0 is CLOSED.
    if (atem.status === 0) finish()

    // Returns the ensureOutputs result, or null if the session ended meanwhile.
    const check = async (announce) => {
      if (announce) this.#set('checking', address)
      const pending = Promise.resolve()
        .then(() => this.#deps.ensureOutputs(atem, { onFixing: () => !ended && this.#set('setting', address) }))
        .catch(() => ({ ok: false, fixed: [] }))
      const result = await Promise.race([pending, endedPromise.then(() => null)])
      return ended ? null : result
    }

    const first = await check(true)
    if (first) {
      this.#outputWarning = !first.ok
      this.#set('ready', address)
      while (!ended && this.#outputWarning) {
        await this.#sleepOr(this.#t.outputRetryMs, endedPromise)
        if (ended) break
        const retry = await check(false)
        if (retry?.ok) {
          this.#outputWarning = false
          this.#set('ready', address)
        }
      }
    }
    await endedPromise
    this.#endSession = null
  }

  #sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms)
      this.#wake = done
      function done() {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  #sleepOr(ms, other) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      other.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async #destroy(atem) {
    try {
      await (atem.destroy ? atem.destroy() : atem.disconnect())
    } catch {
      // already gone
    }
  }
}

function createSupervisor(deps) {
  return new Supervisor(deps)
}

module.exports = { createSupervisor, DEFAULT_TIMINGS }
