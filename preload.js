const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  setTaskbarBadge: (count) => ipcRenderer.send('set-badge', count)
});
