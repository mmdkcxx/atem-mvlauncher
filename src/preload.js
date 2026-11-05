const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mv', {
  onAtemState: (cb) => ipcRenderer.on('atem-state', (_e, state) => cb(state)),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveCameraMode: (mode) => ipcRenderer.send('save-camera-mode', mode),
  logCamera: (status) => ipcRenderer.send('log-camera', status),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  submitAddress: (address) => ipcRenderer.invoke('submit-address', address),
  getStatusInfo: () => ipcRenderer.invoke('get-status-info'),
})
