import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import os from 'os';
import { execFile } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

// Electron usa una carpeta persistente del perfil del usuario que se establece mediante MC_MUSIC_BIN_DIR.
const binDir = process.env.MC_MUSIC_BIN_DIR
  ? path.resolve(process.env.MC_MUSIC_BIN_DIR)
  : path.join(projectRoot, 'bin');

const isWindows = process.platform === 'win32';
const ytDlpFilename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = path.join(binDir, ytDlpFilename);
const updateStatePath = path.join(binDir, '.yt-dlp-update.json');
const updateChannel = ['stable', 'nightly'].includes(process.env.YT_DLP_CHANNEL)
  ? process.env.YT_DLP_CHANNEL
  : 'nightly';
const configuredUpdateInterval = Number(process.env.YT_DLP_UPDATE_INTERVAL_MS);
const updateIntervalMs = Number.isFinite(configuredUpdateInterval) && configuredUpdateInterval >= 0
  ? configuredUpdateInterval
  : 24 * 60 * 60 * 1000;
const failedUpdateRetryMs = 15 * 60 * 1000;
let binaryReady = false;
let activeEnsurePromise = null;

function validateBinary(binaryPath) {
  return new Promise((resolve, reject) => {
    const options = { timeout: 15000, windowsHide: true };
    if (process.versions.electron) {
      options.env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    }
    execFile(binaryPath, ['--version'], options, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function downloadFile(url, destinationPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error('Demasiadas redirecciones descargando yt-dlp.'));
      return;
    }

    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(downloadFile(response.headers.location, destinationPath, redirectCount + 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Error al descargar yt-dlp. Código de estado: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(destinationPath, { flags: 'w' });
      response.setTimeout(30000, () => {
        response.destroy(new Error('La descarga de yt-dlp excedio el tiempo de espera.'));
      });
      response.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(resolve));
      fileStream.on('error', reject);
      response.on('error', reject);
    });

    request.setTimeout(20000, () => {
      request.destroy(new Error('No se pudo conectar a tiempo con el servidor de yt-dlp.'));
    });
    request.on('error', reject);
  });
}

function getDownloadUrl() {
  const repository = updateChannel === 'nightly'
    ? 'yt-dlp/yt-dlp-nightly-builds'
    : 'yt-dlp/yt-dlp';
  return `https://github.com/${repository}/releases/latest/download/${ytDlpFilename}`;
}

function readUpdateState() {
  try {
    return JSON.parse(fs.readFileSync(updateStatePath, 'utf8'));
  } catch {
    return null;
  }
}

function shouldRefreshBinary() {
  if (updateIntervalMs === 0) return true;
  const state = readUpdateState();
  if (!state || state.channel !== updateChannel || !Number.isFinite(Number(state.checkedAt))) {
    return true;
  }
  const retryInterval = state.updateError ? failedUpdateRetryMs : updateIntervalMs;
  return Date.now() - Number(state.checkedAt) >= retryInterval;
}

function writeUpdateState(extra = {}) {
  fs.writeFileSync(updateStatePath, JSON.stringify({
    channel: updateChannel,
    checkedAt: Date.now(),
    ...extra
  }), 'utf8');
}

function publishBinary(partialPath) {
  const backupPath = `${ytDlpPath}.previous`;
  fs.rmSync(backupPath, { force: true });

  if (fs.existsSync(ytDlpPath)) {
    fs.renameSync(ytDlpPath, backupPath);
  }

  try {
    fs.renameSync(partialPath, ytDlpPath);
    fs.rmSync(backupPath, { force: true });
  } catch (error) {
    fs.rmSync(ytDlpPath, { force: true });
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, ytDlpPath);
    throw error;
  }
}

async function downloadAndPublishBinary() {
  const partialPath = `${ytDlpPath}.${process.pid}.download`;
  fs.rmSync(partialPath, { force: true });

  try {
    await downloadFile(getDownloadUrl(), partialPath);
    if (!isWindows) fs.chmodSync(partialPath, '755');
    await validateBinary(partialPath);
    publishBinary(partialPath);
    writeUpdateState({ updatedAt: Date.now() });
    console.log(`[yt-dlp] Canal ${updateChannel} actualizado y validado correctamente.`);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  }
}

/** Obtiene la ruta del ejecutable FFmpeg. */
export function getFfmpegPath() {
  const installerPath = ffmpegInstaller.path;
  if (process.versions.electron && !process.defaultApp) {
    return installerPath.replace('app.asar', 'app.asar.unpacked');
  }
  return installerPath;
}

/**
 * Garantiza una única descarga atómica de yt-dlp y verifica el ejecutable antes
 * de publicarlo. Copia primero el binario integrado antes de intentar red.
 */
export async function ensureYtDlpBinary() {
  if (binaryReady && fs.existsSync(ytDlpPath) && !shouldRefreshBinary()) return ytDlpPath;
  if (activeEnsurePromise) return activeEnsurePromise;

  activeEnsurePromise = (async () => {
    fs.mkdirSync(binDir, { recursive: true });

    if (fs.existsSync(ytDlpPath)) {
      try {
        await validateBinary(ytDlpPath);
        binaryReady = true;

        if (shouldRefreshBinary()) {
          try {
            console.log(`[yt-dlp] Buscando actualizaciones del canal ${updateChannel}...`);
            await downloadAndPublishBinary();
          } catch (updateError) {
            console.warn('[yt-dlp] No se pudo actualizar; se conserva el binario instalado:', updateError.message);
            writeUpdateState({ updateError: String(updateError.message || updateError).slice(0, 300) });
          }
        }
        return ytDlpPath;
      } catch (validationError) {
        console.warn('[yt-dlp] El binario existente está incompleto; se reemplazará:', validationError.message);
        fs.rmSync(ytDlpPath, { force: true });
      }
    }

    // Si el binario en userData/bin no existe, buscamos el binario empaquetado con la app
    const bundledCandidates = [
      path.join(projectRoot, 'bin', ytDlpFilename),
      path.join(projectRoot, 'app.asar.unpacked', 'bin', ytDlpFilename),
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', ytDlpFilename) : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', ytDlpFilename) : ''
    ].filter(Boolean);

    for (const candidate of bundledCandidates) {
      if (fs.existsSync(candidate)) {
        try {
          console.log(`[yt-dlp] Copiando binario integrado desde ${candidate} hacia ${ytDlpPath}...`);
          fs.copyFileSync(candidate, ytDlpPath);
          if (!isWindows) fs.chmodSync(ytDlpPath, '755');
          await validateBinary(ytDlpPath);
          binaryReady = true;
          writeUpdateState({ updatedAt: Date.now(), bundledSource: candidate });
          return ytDlpPath;
        } catch (copyErr) {
          console.warn('[yt-dlp] Falló copia del binario integrado; se reintentará:', copyErr.message);
          fs.rmSync(ytDlpPath, { force: true });
        }
      }
    }

    console.log(`[yt-dlp] Descargando binario oficial del canal ${updateChannel} para ${process.platform} en ${binDir}...`);
    await downloadAndPublishBinary();
    binaryReady = true;
    return ytDlpPath;
  })().finally(() => {
    activeEnsurePromise = null;
  });

  return activeEnsurePromise;
}

/** Retorna la ruta absoluta del binario de yt-dlp. */
export function getYtDlpPath() {
  return ytDlpPath;
}
