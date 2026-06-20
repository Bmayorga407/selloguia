const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selloguiaDesktop', {
  openPdfForPrint(bytes, fileName) {
    return ipcRenderer.invoke('open-pdf-for-print', {
      bytes: Array.from(bytes || []),
      fileName,
    });
  },
});
