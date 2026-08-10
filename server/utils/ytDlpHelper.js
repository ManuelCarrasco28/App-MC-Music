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

// Vercel solo permite escribir en /tmp; Electron usa una carpeta persistente
// del perfil del usuario que se establece mediante MC_MUSIC_BIN_DIR.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const binDir = process.env.MC_MUSIC_BIN_DIR
  ? path.resolve(process.env.MC_MUSIC_BIN_DIR)
  : isServerless
    ? path.join(os.tmpdir(), 'mc_music_bin')
    : path.join(projectRoot, 'bin');

const isWindows = process.platform === 'win32';
const ytDlpFilename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = path.join(binDir, ytDlpFilename);
let binaryReady = false;
let activeEnsurePromise = null;

function validateBinary(binaryPath) {
  return new Promise((resolve, reject) => {
    execFile(binaryPath, ['--version'], { timeout: 15000 }, (error) => {
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
      response.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(resolve));
      fileStream.on('error', reject);
      response.on('error', reject);
    });

    request.on('error', reject);
  });
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
 * de publicarlo. Así ninguna petición puede ejecutar un archivo parcial.
 */
export async function ensureYtDlpBinary() {
  if (binaryReady && fs.existsSync(ytDlpPath)) return ytDlpPath;
  if (activeEnsurePromise) return activeEnsurePromise;

  activeEnsurePromise = (async () => {
    fs.mkdirSync(binDir, { recursive: true });

    if (fs.existsSync(ytDlpPath)) {
      try {
        await validateBinary(ytDlpPath);
        binaryReady = true;
        return ytDlpPath;
      } catch (validationError) {
        console.warn('[yt-dlp] El binario existente está incompleto; se reemplazará:', validationError.message);
        fs.rmSync(ytDlpPath, { force: true });
      }
    }

    console.log(`[yt-dlp] Descargando binario oficial yt-dlp para ${process.platform} en ${binDir}...`);
    const downloadUrl = isWindows
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    const partialPath = `${ytDlpPath}.${process.pid}.download`;

    try {
      await downloadFile(downloadUrl, partialPath);
      if (!isWindows) fs.chmodSync(partialPath, '755');
      await validateBinary(partialPath);
      fs.renameSync(partialPath, ytDlpPath);
      binaryReady = true;
      console.log('[yt-dlp] Descarga, validación e instalación completadas con éxito.');
      return ytDlpPath;
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
      throw error;
    }
  })().finally(() => {
    activeEnsurePromise = null;
  });

  return activeEnsurePromise;
}

/** Retorna la ruta absoluta del binario de yt-dlp. */
export function getYtDlpPath() {
  return ytDlpPath;
}
