const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  fetchInbox: (config) => ipcRenderer.invoke('fetch-inbox', config),
  fetchEmail: (config, uid) => ipcRenderer.invoke('fetch-email', config, uid),
});
