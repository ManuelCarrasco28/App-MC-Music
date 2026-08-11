import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let localServer;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

async function startPackagedBackend() {
  process.env.NODE_ENV = 'production';
  process.env.MC_MUSIC_DESKTOP = 'true';
  process.env.MC_MUSIC_BIN_DIR = path.join(app.getPath('userData'), 'bin');

  const { startServer } = await import('../server/index.js');
  localServer = await startServer(0, '127.0.0.1');
  return localServer.address().port;
}

async function createMainWindow() {
  const localPort = app.isPackaged ? await startPackagedBackend() : 5050;

  const iconPath = path.join(__dirname, '../public/logo.png');

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 640,
    show: false,
    icon: iconPath,
    backgroundColor: '#090b10',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const appUrl = app.isPackaged
    ? `http://127.0.0.1:${localPort}`
    : 'http://127.0.0.1:3000';

  try {
    await mainWindow.loadURL(appUrl);
  } catch (error) {
    dialog.showErrorBox('MC-Music no pudo iniciar', error.message);
    app.quit();
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(createMainWindow).catch((error) => {
  dialog.showErrorBox('Error al iniciar MC-Music', error.message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('before-quit', () => {
  localServer?.close();
});
