import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const binDir = path.join(projectRoot, 'bin');

const isWindows = process.platform === 'win32';
const ytDlpFilename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = path.join(binDir, ytDlpFilename);

/**
 * Obtiene la ruta del ejecutable ffmpeg.
 */
export function getFfmpegPath() {
  return ffmpegInstaller.path;
}

/**
 * Garantiza que el ejecutable yt-dlp esté presente. Si no existe, lo descarga desde la release oficial de GitHub.
 */
export async function ensureYtDlpBinary() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (fs.existsSync(ytDlpPath)) {
    return ytDlpPath;
  }

  console.log(`[yt-dlp] Descargando binario oficial yt-dlp para ${process.platform}...`);
  
  const downloadUrl = isWindows
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(ytDlpPath);

    const request = (url) => {
      https.get(url, (response) => {
        // Manejar redirecciones de GitHub (302)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Error al descargar yt-dlp. Código de estado: ${response.statusCode}`));
        }

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (!isWindows) {
              fs.chmodSync(ytDlpPath, '755');
            }
            console.log('[yt-dlp] Descarga e instalación completada con éxito.');
            resolve(ytDlpPath);
          });
        });
      }).on('error', (err) => {
        fs.unlink(ytDlpPath, () => {});
        reject(err);
      });
    };

    request(downloadUrl);
  });
}

/**
 * Retorna la ruta absoluta del binario de yt-dlp.
 */
export function getYtDlpPath() {
  return ytDlpPath;
}
