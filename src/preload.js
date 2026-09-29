const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('companion', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.send('settings:save', s),
  onSettings: on('settings:changed'),
  onSelect: on('settings:select'),
  onCursor: on('cursor'),
  openSettings: (charId) => ipcRenderer.send('settings:open', charId),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', ignore),
  showCharacterMenu: (charId) => ipcRenderer.send('character:menu', charId),
});
