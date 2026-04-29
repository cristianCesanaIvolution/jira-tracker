const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // config / settings
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  validateCredentials: (cfg) => ipcRenderer.invoke('jira:validate', cfg),
  getInterval: () => ipcRenderer.invoke('scheduler:getInterval'),
  setInterval: (min) => ipcRenderer.invoke('scheduler:setInterval', min),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),

  // popup
  popup: {
    getContext: () => ipcRenderer.invoke('popup:getContext'),
    chooseTask: (key) => ipcRenderer.invoke('popup:chooseTask', key),
    ignore: () => ipcRenderer.invoke('popup:ignore'),
    skip: () => ipcRenderer.invoke('popup:skip'),
    refreshTasks: () => ipcRenderer.invoke('popup:refreshTasks'),
  },

  // dashboard
  dashboard: {
    getEntries: (from, to) => ipcRenderer.invoke('entries:get', from, to),
    getAggregated: (from, to) => ipcRenderer.invoke('entries:getAggregated', from, to),
    updateEntry: (id, fields) => ipcRenderer.invoke('entries:update', id, fields),
    syncGroup: (group) => ipcRenderer.invoke('entries:syncGroup', group),
    deleteGroup: (entryIds) => ipcRenderer.invoke('entries:deleteGroup', entryIds),
    getNextPromptInfo: () => ipcRenderer.invoke('scheduler:getNextPromptInfo'),
  },
});
