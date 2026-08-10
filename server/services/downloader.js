import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getYtDlpPath, getFfmpegPath, ensureYtDlpBinary } from '../utils/ytDlpHelper.js';
import { normalizeYoutubeUrl } from '../utils/validator.js';
import { validateAndPrepareFolder } from '../utils/folderHelper.js';
import { finishDownloadProgress, updateDownloadProgress } from './progressStore.js';

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

function getYtDlpProcessOptions(extraOptions = {}) {
  if (!process.versions.electron) return extraOptions;

  return {
    ...extraOptions,
    env: {
      ...process.env,
      // Permite que yt-dlp reutilice el ejecutable de Electron como runtime Node
      // sin exigir que el cliente instale Node.js por separado.
      ELECTRON_RUN_AS_NODE: '1'
    }
  };
}

function classifyDownloadError(stderr, exitCode) {
  const detail = String(stderr || '').toLowerCase();

  if (detail.includes('sign in to confirm') || detail.includes('not a bot')) {
    return {
      code: 'YOUTUBE_BOT_CHECK',
      message: 'YouTube bloqueó temporalmente la IP del servidor. Inténtalo nuevamente más tarde.'
    };
  }
  if (detail.includes('javascript runtime') || detail.includes('js runtime')) {
    return {
      code: 'YOUTUBE_JS_RUNTIME',
      message: 'El servidor no pudo resolver la verificación JavaScript de YouTube.'
    };
  }
  if (detail.includes('requested format is not available') || detail.includes('no video formats')) {
    return {
      code: 'FORMAT_UNAVAILABLE',
      message: 'La calidad seleccionada no está disponible para este video.'
    };
  }
  if (detail.includes('ffmpeg')) {
    return {
      code: 'FFMPEG_ERROR',
      message: 'FFmpeg no pudo convertir el archivo solicitado.'
    };
  }
  if (detail.includes('http error 403')) {
    return {
      code: 'YOUTUBE_FORBIDDEN',
      message: 'YouTube rechazó la descarga desde este servidor.'
    };
  }

  return {
    code: `YTDLP_EXIT_${exitCode ?? 'UNKNOWN'}`,
    message: 'Fallo al procesar la conversión de audio/video.'
  };
}

const YOUTUBE_BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
};

async function requestPlayerDetails(videoId, apiKey, client) {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { ...YOUTUBE_BROWSER_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: { client: { ...client, hl: 'es', gl: 'PE' } }
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.videoDetails || null;
}

async function getPlayerApiStats(videoId) {
  const embedResponse = await fetch(`https://www.youtube.com/embed/${videoId}`, {
    headers: YOUTUBE_BROWSER_HEADERS,
    signal: AbortSignal.timeout(10000)
  });

  if (!embedResponse.ok) {
    throw new Error(`El reproductor de YouTube respondió con estado ${embedResponse.status}`);
  }

  const embedHtml = await embedResponse.text();
  const apiKey = embedHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const webVersion = embedHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];

  if (!apiKey || !webVersion) {
    throw new Error('YouTube no publicó la configuración del reproductor.');
  }

  let details = await requestPlayerDetails(videoId, apiKey, {
    clientName: 'WEB',
    clientVersion: webVersion
  });

  if (!details) {
    details = await requestPlayerDetails(videoId, apiKey, {
      clientName: 'ANDROID',
      clientVersion: '20.10.38',
      androidSdkVersion: 35
    });
  }

  if (!details) {
    throw new Error('YouTube no devolvió detalles públicos del video.');
  }

  return {
    duration: Number(details.lengthSeconds) || 0,
    views: Number(details.viewCount) || 0
  };
}

async function getPublicViewCount(videoId) {
  const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`, {
    headers: { 'User-Agent': 'MC-Music/1.0' },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) return 0;
  const data = await response.json();
  return Number(data.viewCount) || 0;
}

async function getPublicPageStats(url) {
  const videoId = new URL(url).searchParams.get('v');

  try {
    const playerStats = await getPlayerApiStats(videoId);
    if (playerStats.duration || playerStats.views) return playerStats;
  } catch (playerError) {
    console.warn('[downloader] Falló el respaldo del reproductor:', playerError.message);
  }

  const response = await fetch(url, {
    headers: YOUTUBE_BROWSER_HEADERS,
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

  const [response, fallbackViews] = await Promise.all([
    fetch(endpoint, {
      headers: { 'User-Agent': 'MC-Music/1.0' },
      signal: AbortSignal.timeout(10000)
    }),
    getPublicViewCount(videoId).catch(() => 0)
  ]);

  if (!response.ok) {
    throw new Error(`YouTube oEmbed respondió con estado ${response.status}`);
  }

  const info = await response.json();
  let stats = { duration: 0, views: fallbackViews };

  // Las IP serverless de Vercel son bloqueadas por los endpoints de reproducción
  // de YouTube. En producción respondemos de inmediato con oEmbed + vistas y
  // dejamos que el navegador del cliente calcule la duración en paralelo.
  if (!process.env.VERCEL) {
    try {
      const pageStats = await getPublicPageStats(url);
      stats = {
        duration: pageStats.duration || 0,
        views: pageStats.views || stats.views
      };
    } catch (statsError) {
      console.warn('[downloader] No se pudieron completar duración y vistas:', statsError.message);
    }
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
    execFile(ytDlpPath, args, getYtDlpProcessOptions({
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    }), (error, stdout, stderr) => {
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
          .filter(f => f.vcodec && f.vcodec !== 'none')
          .map(f => f.height)
          .filter(h => typeof h === 'number' && h >= 240)
          .sort((a, b) => b - a);

        const uniqueHeights = [...new Set(rawHeights)].map(String);
        const videoResolutions = uniqueHeights.length > 0 ? uniqueHeights : ['1080', '720', '480', '360'];

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
  const { url: rawUrl, format = 'mp3', quality = '320', resolution = '720', customPath, directSaveOnly, jobId } = req.query;
  updateDownloadProgress(jobId, 1, 'preparing');
  await ensureYtDlpBinary();

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
    finishDownloadProgress(jobId, err.message);
    return res.status(400).json({ error: err.message });
  }
  updateDownloadProgress(jobId, 5, 'starting');

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
    '--newline',
    '--no-color',
    '--progress-delta', '0.2',
    '--progress-template', 'download:MC_PROGRESS:%(progress._percent_str)s',
    '-o', tempFilePath
  ];

  if (format === 'mp3') {
    const audioBitrate = ['320', '256', '128'].includes(String(quality))
      ? String(quality)
      : '320';

    args.push(
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', `${audioBitrate}K`
    );
  } else {
    const resLimit = parseInt(resolution, 10) || 720;
    args.push(
      '-f', `bestvideo[height=${resLimit}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height=${resLimit}]+bestaudio/best[height=${resLimit}][ext=mp4]/bestvideo[height<=${resLimit}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${resLimit}]+bestaudio/best[height<=${resLimit}][ext=mp4]`,
      '--merge-output-format', 'mp4'
    );
  }

  args.push(url);

  console.log(`[downloader] Descargando [${format.toUpperCase()}] para: "${info.title}"`);
  const startTime = Date.now();

  const proc = spawn(ytDlpPath, args, getYtDlpProcessOptions());
  let stderrOutput = '';
  let latestProgress = 5;

  const handleProgressOutput = (data) => {
    const output = data.toString();
    for (const match of output.matchAll(/MC_PROGRESS:\s*([\d.]+)%/g)) {
      const sourceProgress = Number(match[1]);
      if (!Number.isFinite(sourceProgress)) continue;
      const mappedProgress = Math.min(90, Math.max(5, Math.round(5 + sourceProgress * 0.85)));
      if (mappedProgress > latestProgress) {
        latestProgress = mappedProgress;
        updateDownloadProgress(jobId, latestProgress, 'downloading');
      }
    }
  };

  proc.stdout.on('data', handleProgressOutput);

  proc.stderr.on('data', (data) => {
    handleProgressOutput(data);
    const msg = data.toString();
    stderrOutput = `${stderrOutput}${msg}`.slice(-12000);
    if (msg.includes('[download]') || msg.includes('[ExtractAudio]') || msg.includes('[Merger]')) {
      console.log(`[yt-dlp log] ${msg.trim()}`);
    }
  });

  proc.on('close', (code) => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⚡ Conversión completada en ${elapsedSec}s (exit code ${code})`);

    if (code !== 0 || !fs.existsSync(tempFilePath)) {
      const failure = classifyDownloadError(stderrOutput, code);
      finishDownloadProgress(jobId, failure.message);
      console.error(`[downloader] Proceso yt-dlp falló con código ${code} (${failure.code}):`, stderrOutput);
      if (!res.headersSent) {
        return res.status(502).json({ error: failure.message, code: failure.code });
      }
      return;
    }
    updateDownloadProgress(jobId, 95, 'finalizing');

    const targetFolderPath = customPath && customPath.trim() ? customPath.trim() : '';

    let savedToCustomFolder = null;
    if (targetFolderPath) {
      const folderCheck = validateAndPrepareFolder(targetFolderPath);
      if (!folderCheck.valid) {
        fs.unlink(tempFilePath, () => {});
        finishDownloadProgress(jobId, folderCheck.error);
        return res.status(400).json({ error: folderCheck.error });
      }
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
      if (!savedToCustomFolder) {
        fs.unlink(tempFilePath, () => {});
        finishDownloadProgress(jobId, 'No se configuró una carpeta de destino válida.');
        return res.status(400).json({ error: 'No se configuró una carpeta de destino válida.' });
      }
      fs.unlink(tempFilePath, () => {});
      res.setHeader('Content-Type', 'application/json');
      finishDownloadProgress(jobId);
      return res.json({
        success: true,
        savedToPath: savedToCustomFolder || targetFolderPath,
        fileName,
        elapsedSec
      });
    }

    const contentType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
    const stat = fs.statSync(tempFilePath);
    updateDownloadProgress(jobId, 97, 'transferring');

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

    res.on('finish', () => finishDownloadProgress(jobId));

    readStream.on('error', (err) => {
      console.error('[downloader] Error transmitiendo stream:', err);
      finishDownloadProgress(jobId, 'Error transmitiendo el archivo descargado.');
      fs.unlink(tempFilePath, () => {});
    });
  });

  proc.on('error', (err) => {
    console.error('[downloader] Error al spawnear yt-dlp:', err);
    finishDownloadProgress(jobId, 'Error interno en el servidor de conversión.');
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
