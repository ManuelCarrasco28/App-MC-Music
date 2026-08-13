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

async function startDesktopBackend() {
  process.env.MC_MUSIC_DESKTOP = 'true';
  process.env.MC_MUSIC_DATA_DIR = app.getPath('userData');
  if (!process.env.MC_MUSIC_BIN_DIR) {
    process.env.MC_MUSIC_BIN_DIR = path.join(app.getPath('userData'), 'bin');
  }

  const { startServer } = await import('../server/index.js');
  const targetPort = app.isPackaged ? 0 : Number(process.env.PORT) || 5050;
  localServer = await startServer(targetPort, '127.0.0.1');
  return localServer.address().port;
}

async function createMainWindow() {
  let localPort = 5050;
  try {
    localPort = await startDesktopBackend();
  } catch (backendError) {
    console.warn('[electron] No se pudo iniciar el servidor integrado en puerto dinámico:', backendError.message);
  }

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
    : (process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3000');

  let loaded = false;
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      await mainWindow.loadURL(appUrl);
      loaded = true;
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  if (!loaded) {
    dialog.showErrorBox('MC-Music no pudo iniciar', lastError?.message || 'No se pudo conectar al servidor local.');
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
