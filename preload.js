const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getMailboxConfigs: () => ipcRenderer.invoke('get-mailbox-configs'),
  saveMailboxConfigs: (configs) => ipcRenderer.invoke('save-mailbox-configs', configs),
  clearConfig: () => ipcRenderer.invoke('clear-config'),
  listMailboxes: (config) => ipcRenderer.invoke('list-mailboxes', config),
  fetchFolderEmails: (config, folderKey, mailboxMap, options) =>
    ipcRenderer.invoke('fetch-folder-emails', config, folderKey, mailboxMap, options),
  fetchFolderUnreadCount: (config, folderKey, mailboxMap) =>
    ipcRenderer.invoke('fetch-folder-unread-count', config, folderKey, mailboxMap),
  fetchFolderEmail: (config, folderKey, uid, mailboxMap) =>
    ipcRenderer.invoke('fetch-folder-email', config, folderKey, uid, mailboxMap),
  onOpenSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings', handler);
    return () => {
      ipcRenderer.removeListener('open-settings', handler);
    };
  },
});
