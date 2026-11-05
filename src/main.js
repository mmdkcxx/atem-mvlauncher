const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, ipcMain, powerSaveBlocker, session, shell } = require('electron')
const { Atem } = require('atem-connection')
const { loadConfig, updateConfig } = require('./config')
const { ensureOutputs } = require('./outputs')
const { candidateAddresses } = require('./discovery')
const { createSupervisor } = require('./supervisor')
const { createLogger } = require('./logger')
const { actionForKey, createHoldDetector } = require('./hotkeys')
const { createRelaunchGuard } = require('./relaunch-guard')

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
  let dataDir
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
      dataDir,
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
    dataDir = app.getPath('userData')
    configPath = path.join(dataDir, 'config.json')
    log = createLogger(path.join(dataDir, 'app.log'))
    log.info(`start, electron ${process.versions.electron}, config ${configPath}`)

    // Kiosk hardening: never sleep, start at login, come back after a crash (at most 5 times a minute).
    powerSaveBlocker.start('prevent-display-sleep')
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })
    const guard = createRelaunchGuard(path.join(dataDir, 'relaunch.json'))
    const relaunchOrGiveUp = (reason) => {
      log.error(reason)
      if (guard.allow()) {
        log.warn('relaunching')
        app.relaunch()
        app.exit(0)
      } else {
        log.error('too many relaunches in the last minute, not relaunching')
      }
    }
    app.on('render-process-gone', (_e, _wc, details) => {
      if (details.reason !== 'clean-exit') relaunchOrGiveUp(`render process gone: ${details.reason}`)
    })
    app.on('child-process-gone', (_e, details) => {
      if (details.reason !== 'clean-exit') relaunchOrGiveUp(`child process gone: ${details.type} ${details.reason}`)
    })
    process.on('uncaughtException', (err) => relaunchOrGiveUp(`uncaught exception: ${err?.stack ?? err}`))

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
