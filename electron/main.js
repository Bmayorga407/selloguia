const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isMac = process.platform === 'darwin';

function isAllowedLocalUrl(url) {
  return url.startsWith('file://') || url.startsWith('blob:file://') || url.startsWith('data:');
}

function protocolFor(url) {
  try {
    return new URL(url).protocol;
  } catch {
    return '';
  }
}

function installNetworkGuards() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'fullscreen');
  });

  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const protocol = protocolFor(url);
    const blockedProtocols = new Set(['http:', 'https:', 'ws:', 'wss:', 'ftp:']);
    callback({ cancel: blockedProtocols.has(protocol) });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders['Content-Security-Policy'] = [
      "default-src 'self' file: blob: data:; script-src 'self' file: 'unsafe-inline'; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: blob: data:; font-src 'self' file:; worker-src 'self' file: blob:; connect-src 'none'; frame-src blob: file:; object-src 'none'; base-uri 'self'; form-action 'none'"
    ];
    callback({ responseHeaders });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: 'SelloGuia',
    backgroundColor: '#f3f4f7',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) return { action: 'allow' };
    if (isAllowedLocalUrl(url)) return { action: 'allow' };
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedLocalUrl(url)) event.preventDefault();
  });

  win.webContents.on('did-fail-load', (_event, _code, description, url) => {
    if (/^(https?|wss?|ftp):/.test(url)) {
      dialog.showErrorBox('Conexión bloqueada', `SelloGuia bloqueó una conexión externa:\n${url}\n\n${description}`);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

ipcMain.handle('open-pdf-for-print', async (_event, payload) => {
  const bytes = payload?.bytes;
  if (!bytes?.length) throw new Error('PDF vacio');

  const tempDir = path.join(app.getPath('temp'), 'SelloGuia');
  await fs.mkdir(tempDir, { recursive: true });

  const safeName = String(payload?.fileName || 'selloguia.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.pdf$/i, '');
  const filePath = path.join(tempDir, `${safeName}-${Date.now()}.pdf`);

  await fs.writeFile(filePath, Buffer.from(bytes));

  const fileUrl = pathToFileURL(filePath).toString();
  try {
    await shell.openExternal(fileUrl);
  } catch {
    await shell.openPath(filePath);
  }

  return { ok: true, filePath };
});

app.whenReady().then(() => {
  installNetworkGuards();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) return { action: 'allow' };
    if (isAllowedLocalUrl(url)) return { action: 'allow' };
    return { action: 'deny' };
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
