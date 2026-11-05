const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, ipcMain, session, shell } = require('electron')
const { Atem } = require('atem-connection')
const { loadConfig, updateConfig } = require('./config')
const { ensureOutputs } = require('./outputs')
const { candidateAddresses } = require('./discovery')
const { createSupervisor } = require('./supervisor')
const { createLogger } = require('./logger')
const { actionForKey, createHoldDetector } = require('./hotkeys')

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  start()
}

function start() {
  let win = null
  let supervisor = null
  let lastAtemState = { state: 'searching', outputWarning: false }
  let configPath
  let log

  app.on('second-instance', () => win?.focus())
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    supervisor?.stop()
  })

  function createWindow() {
    win = new BrowserWindow({
      fullscreen: true,
      autoHideMenuBar: true,
      backgroundColor: '#0e1013',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    win.setMenu(null)
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    win.webContents.on('did-finish-load', () => win.webContents.send('atem-state', lastAtemState))
    win.webContents.on('before-input-event', onInput)
  }

  const quitHold = createHoldDetector(() => {
    log.info('quit requested from keyboard')
    app.quit()
  })

  function onInput(event, input) {
    if (input.type === 'keyUp') {
      const k = input.key.toLowerCase()
      if (k === 'q' || k === 'control') quitHold.up()
      return
    }
    const action = actionForKey({ key: input.key, ctrlKey: input.control })
    if (!action) return
    event.preventDefault()
    switch (action) {
      case 'status':
      case 'address':
        win.webContents.send('menu', action)
        break
      case 'camera-settings':
        shell.openExternal('ms-settings:privacy-webcam')
        break
      case 'fullscreen':
        win.setFullScreen(!win.isFullScreen())
        break
      case 'quit-hold':
        quitHold.down()
        break
    }
  }

  function wireIpc() {
    ipcMain.handle('get-config', () => loadConfig(configPath))
    ipcMain.on('save-camera-mode', (_e, mode) => updateConfig(configPath, { cameraMode: mode }))
    ipcMain.on('log-camera', (_e, status) => log.info(`camera: ${status}`))
    ipcMain.handle('submit-address', async (_e, address) => {
      if (typeof address !== 'string' || !IPV4.test(address.trim())) return false
      log.info(`manual address entered: ${address.trim()}`)
      return supervisor.tryAddress(address.trim())
    })
    ipcMain.handle('get-status-info', () => ({
      state: lastAtemState.state,
      address: lastAtemState.address,
      logTail: log.tail(12),
    }))
  }

  function createSupervisorWithWiring() {
    return createSupervisor({
      // disableMultithreaded: no child process, which would need the Electron binary to be re-spawned.
      createAtem: () => new Atem({ disableMultithreaded: true }),
      getCandidates: async () => candidateAddresses({ config: loadConfig(configPath), ifaces: os.networkInterfaces() }),
      ensureOutputs,
      onConnected: (address) => {
        updateConfig(configPath, { lastAddress: address })
        log.info(`connected to ${address}`)
      },
    })
  }

  app.whenReady().then(() => {
    const dataDir = app.getPath('userData')
    configPath = path.join(dataDir, 'config.json')
    log = createLogger(path.join(dataDir, 'app.log'))
    log.info(`start, electron ${process.versions.electron}, config ${configPath}`)

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

    wireIpc()
    supervisor = createSupervisorWithWiring()
    supervisor.on('state', (s) => {
      lastAtemState = s
      log.info(`atem: ${s.state}${s.address ? ` ${s.address}` : ''}${s.outputWarning ? ' (output warning)' : ''}`)
      win?.webContents.send('atem-state', s)
    })
    createWindow()
    supervisor.start()
  })
}
