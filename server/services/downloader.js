import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getYtDlpPath, getFfmpegPath, ensureYtDlpBinary } from '../utils/ytDlpHelper.js';
import { normalizeYoutubeUrl } from '../utils/validator.js';
import { validateAndPrepareFolder } from '../utils/folderHelper.js';

const tempDir = path.join(os.tmpdir(), 'mc_music_downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = Math.floor(Number(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

function sanitizeFilename(title) {
  if (!title) return 'audio';
  return title
    .replace(/[\\/:\*\?"<>\|]/g, '')
    .replace(/[\s+]+/g, ' ')
    .trim();
}

function getYoutubeRuntimeArgs() {
  return [
    '--js-runtimes', `node:${process.execPath}`,
    '--remote-components', 'ejs:github',
    '--force-ipv4',
    '--retries', '3',
    '--fragment-retries', '3'
  ];
}

async function getPublicPageStats(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`La página de YouTube respondió con estado ${response.status}`);
  }

  const html = await response.text();
  const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
  const viewsMatch = html.match(/"viewCount":"(\d+)"/);

  return {
    duration: durationMatch ? Number(durationMatch[1]) : 0,
    views: viewsMatch ? Number(viewsMatch[1]) : 0
  };
}

async function getOEmbedInfo(url) {
  const videoId = new URL(url).searchParams.get('v');
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'MC-Music/1.0' },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`YouTube oEmbed respondió con estado ${response.status}`);
  }

  const info = await response.json();
  let stats = { duration: 0, views: 0 };

  try {
    stats = await getPublicPageStats(url);
  } catch (statsError) {
    console.warn('[downloader] No se pudieron completar duración y vistas:', statsError.message);
  }

  return {
    id: videoId,
    url,
    title: info.title || 'Desconocido',
    author: info.author_name || 'Canal desconocido',
    duration: stats.duration,
    durationFormatted: stats.duration ? formatDuration(stats.duration) : '--:--',
    thumbnail: info.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    views: stats.views ? stats.views.toLocaleString('es-ES') : '--',
    audioQualities: ['320', '256', '128'],
    videoResolutions: ['1080', '720', '480', '360'],
    metadataSource: 'oembed'
  };
}

export async function getVideoInfo(rawUrl) {
  const url = normalizeYoutubeUrl(rawUrl);

  try {
    await ensureYtDlpBinary();
  } catch (binaryError) {
    console.error('[downloader] No se pudo preparar yt-dlp:', binaryError.message);
    return getOEmbedInfo(url);
  }

  const ytDlpPath = getYtDlpPath();

  const args = [
    '--dump-single-json',
    '--no-warnings',
    '--no-call-home',
    '--skip-download',
    '--no-playlist',
    ...getYoutubeRuntimeArgs(),
    url
  ];

  return new Promise((resolve, reject) => {
    execFile(ytDlpPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[downloader] Error en execFile yt-dlp info:', stderr || error.message);
        getOEmbedInfo(url)
          .then(resolve)
          .catch((fallbackError) => {
            console.error('[downloader] También falló el respaldo oEmbed:', fallbackError.message);
            reject(new Error('YouTube rechazó temporalmente la consulta. Inténtalo nuevamente en unos minutos.'));
          });
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const title = info.title || 'Desconocido';
        const uploader = info.uploader || info.channel || 'Canal Desconocido';
        const duration = info.duration || 0;
        const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : '');
        const views = info.view_count || 0;

        // Extraer resoluciones reales disponibles en el video de YouTube
        const rawHeights = (info.formats || [])
          .map(f => f.height)
          .filter(h => typeof h === 'number' && h >= 240)
          .sort((a, b) => b - a);

        const uniqueHeights = [...new Set(rawHeights)].map(String);
        const videoResolutions = uniqueHeights.length > 0 ? uniqueHeights.slice(0, 5) : ['1080', '720', '480', '360'];

        resolve({
          id: info.id,
          url,
          title,
          author: uploader,
          duration,
          durationFormatted: formatDuration(duration),
          thumbnail,
          views: views.toLocaleString('es-ES'),
          audioQualities: ['320', '256', '128'],
          videoResolutions
        });
      } catch (parseErr) {
        console.error('[downloader] Error parseando JSON de yt-dlp:', parseErr);
        reject(new Error('Respuesta no válida del extractor de YouTube.'));
      }
    });
  });
}

export async function processDownload(req, res) {
  await ensureYtDlpBinary();
  const { url: rawUrl, format = 'mp3', quality = '320', resolution = '720', customPath, directSaveOnly } = req.query;

  if (!rawUrl) {
    return res.status(400).json({ error: 'La URL de YouTube es requerida.' });
  }

  const url = normalizeYoutubeUrl(rawUrl);
  const ytDlpPath = getYtDlpPath();
  const ffmpegPath = getFfmpegPath();

  let info;
  try {
    info = await getVideoInfo(url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const cleanTitle = sanitizeFilename(info.title);
  const fileExt = format === 'mp4' ? 'mp4' : 'mp3';
  const fileName = `${cleanTitle}.${fileExt}`;
  const tempFilePath = path.join(tempDir, `${info.id}_${Date.now()}.${fileExt}`);

  const args = [
    '--no-warnings',
    '--no-call-home',
    ...getYoutubeRuntimeArgs(),
    '--ffmpeg-location', ffmpegPath,
    '--concurrent-fragments', '5',
    '-o', tempFilePath
  ];

  if (format === 'mp3') {
    let audioBitrateQuality = '0';
    if (quality === '256') audioBitrateQuality = '2';
    if (quality === '128') audioBitrateQuality = '5';

    args.push(
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', audioBitrateQuality
    );
  } else {
    const resLimit = parseInt(resolution, 10) || 720;
    args.push(
      '-f', `bestvideo[height<=${resLimit}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${resLimit}][ext=mp4]/best`,
      '--merge-output-format', 'mp4'
    );
  }

  args.push(url);

  console.log(`[downloader] Descargando [${format.toUpperCase()}] para: "${info.title}"`);
  const startTime = Date.now();

  const proc = spawn(ytDlpPath, args);

  proc.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('[download]') || msg.includes('[ExtractAudio]') || msg.includes('[Merger]')) {
      console.log(`[yt-dlp log] ${msg.trim()}`);
    }
  });

  proc.on('close', (code) => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⚡ Conversión completada en ${elapsedSec}s (exit code ${code})`);

    if (code !== 0 || !fs.existsSync(tempFilePath)) {
      console.error(`[downloader] Proceso yt-dlp falló con código ${code}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Fallo al procesar la conversión de audio/video.' });
      }
      return;
    }

    let targetFolderPath = customPath && customPath.trim() ? customPath.trim() : '';
    if (!targetFolderPath) {
      const userHome = process.env.USERPROFILE || os.homedir() || 'C:\\';
      targetFolderPath = path.join(userHome, format === 'mp4' ? 'Videos' : 'Music');
    }

    let savedToCustomFolder = null;
    const folderCheck = validateAndPrepareFolder(targetFolderPath);
    if (folderCheck.valid) {
      try {
        const destinationPath = path.join(folderCheck.path, fileName);
        fs.copyFileSync(tempFilePath, destinationPath);
        savedToCustomFolder = destinationPath;
        console.log(`[downloader] Archivo guardado en la PC en ${elapsedSec}s: "${destinationPath}"`);
      } catch (copyErr) {
        console.error('[downloader] Error al copiar a carpeta personalizada:', copyErr);
      }
    }

    if (directSaveOnly === 'true' || String(directSaveOnly) === '1') {
      fs.unlink(tempFilePath, () => {});
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        savedToPath: savedToCustomFolder || targetFolderPath,
        fileName,
        elapsedSec
      });
    }

    const contentType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
    const stat = fs.statSync(tempFilePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Saved-Folder': savedToCustomFolder ? encodeURIComponent(savedToCustomFolder) : '',
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Saved-Folder'
    });

    const readStream = fs.createReadStream(tempFilePath);
    readStream.pipe(res);

    readStream.on('end', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('[downloader] Error eliminando temp file:', err);
      });
    });

    readStream.on('error', (err) => {
      console.error('[downloader] Error transmitiendo stream:', err);
      fs.unlink(tempFilePath, () => {});
    });
  });

  proc.on('error', (err) => {
    console.error('[downloader] Error al spawnear yt-dlp:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno en el servidor de conversión.' });
    }
  });

  const cancelDownload = () => {
    if (proc && !proc.killed) {
      console.log('[downloader] Petición cancelada por el cliente.');
      proc.kill('SIGTERM');
      if (fs.existsSync(tempFilePath)) {
        fs.unlink(tempFilePath, () => {});
      }
    }
  };

  req.on('aborted', cancelDownload);
  res.on('close', () => {
    if (!res.writableEnded) cancelDownload();
  });
}
