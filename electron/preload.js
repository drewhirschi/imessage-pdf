// Preload runs with contextIsolation ON and nodeIntegration OFF. It exposes a
// deliberately small `window.electron` surface — exactly what the renderer
// needs and nothing more:
//   - openExternal(url):   open a URL / system-settings deep link in the OS.
//   - relaunch():          quit and reopen the app (used after granting FDA).
//   - exportPDF(body):     render the print route to a PDF via the main process
//                          and prompt a native "Save as…" dialog.
//   - isElectron:          a cheap truthy marker for feature detection.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  relaunch: () => ipcRenderer.invoke('relaunch'),
  exportPDF: (body) => ipcRenderer.invoke('export-pdf', body),
});
