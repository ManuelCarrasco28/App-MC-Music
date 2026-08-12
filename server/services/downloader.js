import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getYtDlpPath, getFfmpegPath, ensureYtDlpBinary } from '../utils/ytDlpHelper.js';
import { detectPlatform, isValidMediaUrl, normalizeMediaUrl } from '../utils/validator.js';
import { validateAndPrepareFolder } from '../utils/folderHelper.js';
import { finishDownloadProgress, registerDownloadCancellation, updateDownloadProgress } from './progressStore.js';

const tempDir = path.join(os.tmpdir(), 'mc_music_downloads');
fs.mkdirSync(tempDir, { recursive: true });

export function cleanOrphanedTempFiles() {
  try {
    if (!fs.existsSync(tempDir)) return;
    const now = Date.now();
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 30 * 60 * 1000) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[downloader] Error al limpiar temporales huérfanos:', err.message);
  }
}
cleanOrphanedTempFiles();

const INFO_CACHE_TTL_MS = 5 * 60 * 1000;
const infoCache = new Map();
const pendingInfoRequests = new Map();
// Los Symbols no se serializan al responder /api/info; la URL firmada queda
// exclusivamente en memoria del backend y nunca se expone al cliente.
const DIRECT_MEDIA_URL = Symbol('directMediaUrl');
const DIRECT_MEDIA_HEADERS = Symbol('directMediaHeaders');

class MediaError extends Error {
  constructor(code, message, statusCode = 422, extra = {}) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return '--:--';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const minuteText = String(minutes).padStart(2, '0');
  const secondText = String(remainingSeconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`;
}

function parseDurationString(value) {
  if (typeof value !== 'string' || !/^\d+(?::\d+){1,2}$/.test(value.trim())) return 0;
  return value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function sanitizeFilename(title) {
  const clean = String(title || 'video')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/[\s+]+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (clean || 'video').slice(0, 180);
}

function getCookieArgs() {
  const cookiesFile = process.env.MC_MUSIC_COOKIES_FILE?.trim();
  if (!cookiesFile) return [];
  const absolutePath = path.resolve(cookiesFile);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`[downloader] MC_MUSIC_COOKIES_FILE no existe: ${absolutePath}`);
    return [];
  }
  return ['--cookies', absolutePath];
}

function getCommonYtDlpArgs() {
  return [
    '--no-warnings',
    '--no-playlist',
    '--force-ipv4',
    '--socket-timeout', '20',
    '--retries', '5',
    '--fragment-retries', '5',
    '--extractor-retries', '3',
    '--js-runtimes', `node:${process.execPath}`,
    '--remote-components', 'ejs:github',
    ...getCookieArgs()
  ];
}

function getYtDlpProcessOptions(extraOptions = {}) {
  const options = { windowsHide: true, ...extraOptions };
  if (!process.versions.electron) return options;

  return {
    ...options,
    env: {
      ...process.env,
      // El ejecutable de Electron funciona como runtime Node para yt-dlp.
      ELECTRON_RUN_AS_NODE: '1'
    }
  };
}

function formatExtractionFailure(stderr, exitCode) {
  const detail = String(stderr || '').toLowerCase();

  if (detail.includes('unsupported url') || detail.includes('no suitable extractor')) {
    return new MediaError('UNSUPPORTED_LINK', 'Ese tipo de enlace no es compatible. Abre el video y copia su enlace directo.', 422);
  }
  if (detail.includes('private') || detail.includes('login required') || detail.includes('log in')
      || detail.includes('cookies') || detail.includes('not logged in') || detail.includes('sign in')) {
    return new MediaError('AUTH_REQUIRED', 'El video es privado, tiene restriccion de edad o la plataforma exige iniciar sesion.', 401);
  }
  if (detail.includes('not a bot') || detail.includes('confirm you\'re not a bot')) {
    return new MediaError('BOT_CHECK', 'La plataforma activo una verificacion temporal. Actualiza el extractor o intentalo mas tarde.', 429);
  }
  if (detail.includes('http error 429') || detail.includes('too many requests') || detail.includes('rate-limit')) {
    return new MediaError('RATE_LIMITED', 'La plataforma limito temporalmente las consultas. Espera unos minutos e intentalo otra vez.', 429);
  }
  if (detail.includes('geo') && (detail.includes('restrict') || detail.includes('countr'))) {
    return new MediaError('GEO_RESTRICTED', 'El video no esta disponible en esta region.', 451);
  }
  if (detail.includes('drm')) {
    return new MediaError('DRM_PROTECTED', 'El video esta protegido con DRM y no puede procesarse.', 422);
  }
  if (detail.includes('video unavailable') || detail.includes('content is not available')
      || detail.includes('has been removed') || detail.includes('deleted')) {
    return new MediaError('MEDIA_UNAVAILABLE', 'El video fue eliminado o ya no esta disponible.', 410);
  }
  if (detail.includes('no video formats') || detail.includes('does not contain a video')) {
    return new MediaError('NO_VIDEO', 'El enlace no contiene un video descargable.', 422);
  }
  if (detail.includes('requested format is not available')) {
    return new MediaError('FORMAT_UNAVAILABLE', 'La calidad elegida ya no esta disponible. Procesa nuevamente el enlace.', 409);
  }
  if (detail.includes('http error 403') || detail.includes('forbidden')) {
    return new MediaError('ACCESS_DENIED', 'La plataforma rechazo temporalmente el acceso a este video.', 403);
  }
  if (detail.includes('unexpected response') || detail.includes('cannot parse data')
      || detail.includes('please report this issue')) {
    return new MediaError(
      'EXTRACTOR_UPDATE_REQUIRED',
      'La plataforma cambio su pagina y este enlace requiere actualizar yt-dlp. Reinicia la aplicacion con Internet e intentalo otra vez.',
      503
    );
  }
  if (detail.includes('timed out') || detail.includes('unable to download')
      || detail.includes('connection') || detail.includes('network')) {
    return new MediaError('NETWORK_ERROR', 'No se pudo conectar con la plataforma. Revisa Internet e intentalo nuevamente.', 502);
  }
  if (detail.includes('ffmpeg') || detail.includes('postprocessing')) {
    return new MediaError('FFMPEG_ERROR', 'FFmpeg no pudo convertir este archivo multimedia.', 500);
  }

  return new MediaError(
    `YTDLP_EXIT_${exitCode ?? 'UNKNOWN'}`,
    'No se pudo procesar este enlace. Puede ser privado, haber caducado o requerir una version mas reciente del extractor.',
    422
  );
}

function getFormatHeight(format) {
  const explicit = Number(format?.height);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const resolutionMatch = String(format?.resolution || '').match(/\d+x(\d+)/i);
  return resolutionMatch ? Number(resolutionMatch[1]) : 0;
}

function getFormatWidth(format) {
  const explicit = Number(format?.width);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const resolutionMatch = String(format?.resolution || '').match(/(\d+)x\d+/i);
  return resolutionMatch ? Number(resolutionMatch[1]) : 0;
}

// En videos verticales 1080x1920, la calidad comercial correcta es 1080p,
// no 1920p. Para paisaje coincide con la altura habitual (1920x1080).
function getQualityDimension(format) {
  const width = getFormatWidth(format);
  const height = getFormatHeight(format);
  return width && height ? Math.min(width, height) : height || width;
}

function isPlayableVideoFormat(format) {
  if (!format || format.has_drm === true) return false;
  const extension = String(format.ext || '').toLowerCase();
  const protocol = String(format.protocol || '').toLowerCase();
  const codec = String(format.vcodec || '').toLowerCase();
  const note = String(format.format_note || '').toLowerCase();
  if (extension === 'mhtml' || protocol === 'mhtml' || note.includes('storyboard')) return false;
  return codec ? codec !== 'none' : getFormatHeight(format) > 0;
}

function isPlayableAudioFormat(format) {
  if (!format || format.has_drm === true) return false;
  const codec = String(format.acodec || '').toLowerCase();
  return Boolean(codec && codec !== 'none');
}

function selectThumbnail(info) {
  if (typeof info.thumbnail === 'string' && info.thumbnail) return info.thumbnail;
  const candidates = Array.isArray(info.thumbnails)
    ? info.thumbnails.filter((item) => item?.url)
    : [];
  candidates.sort((a, b) => {
    const areaA = (Number(a.width) || 0) * (Number(a.height) || 0);
    const areaB = (Number(b.width) || 0) * (Number(b.height) || 0);
    return areaB - areaA || (Number(b.preference) || 0) - (Number(a.preference) || 0);
  });
  return candidates[0]?.url || '';
}

function unwrapInfo(rawInfo) {
  if (!rawInfo || typeof rawInfo !== 'object') return rawInfo;
  if (Array.isArray(rawInfo.entries)) {
    return rawInfo.entries.find((entry) => entry && (entry.formats?.length || entry.url)) || rawInfo.entries[0] || rawInfo;
  }
  return rawInfo;
}

function durationFromFfmpegOutput(output) {
  const match = String(output || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  return Math.round(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
}

function dimensionsFromFfmpegOutput(output) {
  const match = String(output || '').match(/Video:.*?(\d{2,5})x(\d{2,5})(?:[\s,\[])/is);
  if (!match) return { width: 0, height: 0 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function videoCodecFromFfmpegOutput(output) {
  return String(output || '').match(/Video:\s*([^\s,(]+)/i)?.[1]?.toLowerCase() || null;
}

function audioBitrateFromFfmpegOutput(output) {
  const audioLine = String(output || '').match(/Audio:.*?(?:\r?\n|$)/i)?.[0] || '';
  return Math.round(Number(audioLine.match(/([\d.]+)\s*kb\/s/i)?.[1]) || 0) || null;
}

function normalizeExternalMediaUrl(value) {
  const candidate = String(value || '').startsWith('//') ? `https:${value}` : String(value || '');
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const isPrivateIpv4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname);
    const isLocal = hostname === 'localhost' || hostname.endsWith('.local') || hostname === '::1' || isPrivateIpv4;
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || isLocal) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

async function probeRemoteMediaUrl(mediaUrl, rawHeaders = {}) {
  const safeUrl = normalizeExternalMediaUrl(mediaUrl);
  if (!safeUrl) return { duration: 0, width: 0, height: 0 };

  const safeHeaders = Object.entries(rawHeaders)
    .filter(([key, value]) => /^[\w-]+$/.test(key) && typeof value === 'string' && !/[\r\n]/.test(value))
    .map(([key, value]) => `${key}: ${value}\r\n`)
    .join('');
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'info', '-rw_timeout', '10000000'];
  if (safeHeaders) args.push('-headers', safeHeaders);
  args.push('-i', safeUrl, '-t', '0', '-f', 'null', '-');

  return new Promise((resolve) => {
    const ffmpeg = spawn(getFfmpegPath(), args, { windowsHide: true });
    let output = '';
    let settled = false;
    const details = () => ({
      duration: durationFromFfmpegOutput(output),
      ...dimensionsFromFfmpegOutput(output),
      videoCodec: videoCodecFromFfmpegOutput(output),
      audioBitrate: audioBitrateFromFfmpegOutput(output)
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(details());
    };
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      finish();
    }, 12000);
    timeout.unref?.();

    ffmpeg.stderr.on('data', (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-30000);
      const media = details();
      if (media.duration && media.width && media.height) {
        ffmpeg.kill('SIGTERM');
        finish();
      }
    });
    ffmpeg.once('error', finish);
    ffmpeg.once('close', finish);
  });
}

/**
 * Instagram y algunos videos de Meta omiten `duration` aunque entregan el MP4.
 * FFmpeg solo inspecciona la cabecera remota y se detiene en cuanto encuentra la
 * duracion; no descarga ni convierte el video durante esta comprobacion.
 */
async function probeRemoteDuration(rawInfo) {
  const info = unwrapInfo(rawInfo);
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const candidates = formats
    .filter((format) => isPlayableVideoFormat(format) && /^https:\/\//i.test(format.url || ''))
    .sort((a, b) => (Number(a.tbr) || Number.MAX_SAFE_INTEGER) - (Number(b.tbr) || Number.MAX_SAFE_INTEGER));
  const selected = candidates[0];
  const mediaUrl = selected?.url || (/^https:\/\//i.test(info?.url || '') ? info.url : '');
  if (!mediaUrl) return 0;

  const rawHeaders = { ...(info.http_headers || {}), ...(selected?.http_headers || {}) };
  const details = await probeRemoteMediaUrl(mediaUrl, rawHeaders);
  return details.duration;
}

function buildMetadata(rawInfo, requestedUrl) {
  const info = unwrapInfo(rawInfo);
  const platformMeta = detectPlatform(requestedUrl);
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const videoFormats = formats.filter(isPlayableVideoFormat);
  const audioFormats = formats.filter(isPlayableAudioFormat);

  const qualityDimensions = videoFormats.map(getQualityDimension).filter(Boolean);
  if (!qualityDimensions.length && Number(info?.height) > 0 && (info?.url || videoFormats.length)) {
    const infoWidth = Number(info?.width) || 0;
    const infoHeight = Number(info.height);
    qualityDimensions.push(Math.round(infoWidth ? Math.min(infoWidth, infoHeight) : infoHeight));
  }
  const videoResolutions = [...new Set(qualityDimensions)].sort((a, b) => b - a).map(String);

  if (!videoResolutions.length) {
    throw new MediaError('NO_VIDEO', 'El enlace no contiene un video descargable o la publicacion solo tiene fotografias.', 422);
  }

  const groupedFormats = videoResolutions.map((qualityText) => {
    const quality = Number(qualityText);
    const matching = videoFormats
      .filter((format) => getQualityDimension(format) === quality)
      .sort((a, b) => (Number(b.tbr) || 0) - (Number(a.tbr) || 0));
    const best = matching[0] || {};
    return {
      quality: qualityText,
      width: getFormatWidth(best) || null,
      height: getFormatHeight(best) || null,
      fps: Number(best.fps) || null,
      ext: best.ext || null,
      codec: best.vcodec || null,
      bitrate: Number(best.tbr) || null,
      hasAudio: isPlayableAudioFormat(best)
    };
  });

  const duration = Number(info?.duration) || parseDurationString(info?.duration_string);
  const viewsCount = Number(info?.view_count ?? info?.concurrent_view_count) || 0;
  const likesCount = Number(info?.like_count) || 0;
  const commentsCount = Number(info?.comment_count) || 0;
  const sourceAudioBitrate = Math.round(audioFormats.reduce((highest, format) => {
    const bitrate = Number(format.abr) || (String(format.vcodec).toLowerCase() === 'none' ? Number(format.tbr) || 0 : 0);
    return Math.max(highest, bitrate);
  }, 0));
  const descriptionTitle = String(info?.description || '').split(/\r?\n/)[0].trim();
  const title = String(info?.title || info?.fulltitle || descriptionTitle || `Video de ${platformMeta.platform}`).trim();

  return {
    id: String(info?.id || `${platformMeta.platform}-${Date.now()}`),
    url: info?.webpage_url || requestedUrl,
    originalUrl: requestedUrl,
    title,
    author: info?.uploader || info?.channel || info?.creator || info?.artist || info?.uploader_id || 'Autor desconocido',
    duration,
    durationFormatted: formatDuration(duration),
    thumbnail: selectThumbnail(info),
    views: viewsCount ? viewsCount.toLocaleString('es-ES') : '--',
    viewsCount,
    likes: likesCount ? likesCount.toLocaleString('es-ES') : '--',
    likesCount,
    commentsCount,
    audioQualities: ['320', '256', '128'],
    sourceAudioBitrate: sourceAudioBitrate || null,
    videoResolutions,
    videoFormats: groupedFormats,
    platform: platformMeta.platform,
    platformLabel: platformMeta.label,
    badgeColor: platformMeta.badgeColor,
    isLive: Boolean(info?.is_live || info?.live_status === 'is_live'),
    availability: info?.availability || 'public',
    metadataSource: 'yt-dlp'
  };
}

async function getTikTokFallbackInfo(url, primaryError) {
  const endpoint = new URL('https://www.tikwm.com/api/');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('hd', '1');

  let payload;
  try {
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    console.warn('[downloader] El respaldo TikWM no respondio:', error.message);
    throw new MediaError(
      'TIKTOK_FALLBACK_UNAVAILABLE',
      'TikTok rechazo el enlace y el servicio de respaldo no esta disponible. Intentalo nuevamente en unos minutos.',
      503,
      { primaryCode: primaryError?.code }
    );
  }

  const data = payload?.data;
  if (Number(payload?.code) !== 0 || !data) {
    throw new MediaError(
      'TIKTOK_MEDIA_UNAVAILABLE',
      payload?.msg || 'TikTok no devolvio un video publico para este enlace.',
      422,
      { primaryCode: primaryError?.code }
    );
  }

  // Nunca usamos `music`/`music_info.play`: puede ser la cancion asociada y no
  // el audio que realmente se oye en el video. MP3 se extrae del MP4 elegido.
  const directMediaUrl = normalizeExternalMediaUrl(data.hdplay || data.play || data.wmplay);
  if (!directMediaUrl) {
    const isPhotoPost = Array.isArray(data.images) && data.images.length > 0;
    throw new MediaError(
      isPhotoPost ? 'TIKTOK_PHOTO_POST' : 'TIKTOK_DIRECT_MEDIA_MISSING',
      isPhotoPost
        ? 'La publicacion de TikTok contiene fotografias y no un video descargable.'
        : 'TikTok no entrego un archivo de video compatible para este enlace.',
      422
    );
  }

  const directHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    Referer: 'https://www.tiktok.com/'
  };
  const probed = await probeRemoteMediaUrl(directMediaUrl, directHeaders);
  const width = probed.width || Number(data.width) || 0;
  const height = probed.height || Number(data.height) || 0;
  if (!width || !height) {
    throw new MediaError(
      'TIKTOK_MEDIA_PROBE_FAILED',
      'Se encontro el video de TikTok, pero no fue posible comprobar su resolucion real.',
      502
    );
  }

  const duration = probed.duration || Number(data.duration) || 0;
  const resolution = String(Math.min(width, height));
  const viewsCount = Number(data.play_count) || 0;
  const likesCount = Number(data.digg_count) || 0;
  const commentsCount = Number(data.comment_count) || 0;
  const platformMeta = detectPlatform(url);
  const metadata = {
    id: String(data.id || `tiktok-${Date.now()}`),
    url,
    originalUrl: url,
    title: String(data.title || 'Video de TikTok').trim(),
    author: data.author?.nickname || data.author?.unique_id || 'Autor de TikTok',
    duration,
    durationFormatted: formatDuration(duration),
    durationSource: probed.duration ? 'media-header' : 'tikwm',
    thumbnail: normalizeExternalMediaUrl(data.origin_cover || data.cover || data.ai_dynamic_cover),
    views: viewsCount ? viewsCount.toLocaleString('es-ES') : '--',
    viewsCount,
    likes: likesCount ? likesCount.toLocaleString('es-ES') : '--',
    likesCount,
    commentsCount,
    audioQualities: ['320', '256', '128'],
    sourceAudioBitrate: probed.audioBitrate,
    videoResolutions: [resolution],
    videoFormats: [{
      quality: resolution,
      width,
      height,
      fps: null,
      ext: 'mp4',
      codec: probed.videoCodec,
      bitrate: null,
      hasAudio: true
    }],
    platform: 'tiktok',
    platformLabel: platformMeta.label,
    badgeColor: platformMeta.badgeColor,
    isLive: false,
    availability: 'public',
    metadataSource: 'yt-dlp+tikwm-fallback',
    fallbackReason: primaryError?.code || 'TIKTOK_EXTRACTION_FAILED'
  };
  metadata[DIRECT_MEDIA_URL] = directMediaUrl;
  metadata[DIRECT_MEDIA_HEADERS] = directHeaders;
  return metadata;
}

function runYtDlpInfo(url) {
  const args = [
    '--dump-single-json',
    '--skip-download',
    ...getCommonYtDlpArgs(),
    url
  ];

  return new Promise((resolve, reject) => {
    execFile(getYtDlpPath(), args, getYtDlpProcessOptions({
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000
    }), (error, stdout, stderr) => {
      if (error) {
        console.error('[downloader] yt-dlp no pudo leer metadatos:', String(stderr || error.message).slice(-3000));
        reject(formatExtractionFailure(stderr || error.message, error.code));
        return;
      }

      try {
        resolve(JSON.parse(String(stdout).trim()));
      } catch (parseError) {
        console.error('[downloader] JSON invalido de yt-dlp:', parseError.message);
        reject(new MediaError('INVALID_EXTRACTOR_RESPONSE', 'El extractor devolvio una respuesta invalida.', 502));
      }
    });
  });
}

export async function getVideoInfo(rawUrl) {
  if (!isValidMediaUrl(rawUrl)) {
    throw new MediaError('INVALID_URL', 'Ingresa un enlace directo de YouTube, TikTok, Instagram o Facebook.', 400);
  }

  const url = normalizeMediaUrl(rawUrl);
  const cached = infoCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (pendingInfoRequests.has(url)) return pendingInfoRequests.get(url);

  const request = (async () => {
    try {
      await ensureYtDlpBinary();
    } catch (error) {
      throw new MediaError('EXTRACTOR_NOT_READY', `No se pudo preparar yt-dlp: ${error.message}`, 503);
    }

    let metadata;
    try {
      const rawInfo = await runYtDlpInfo(url);
      metadata = buildMetadata(rawInfo, url);
      if (!metadata.duration) {
        const probedDuration = await probeRemoteDuration(rawInfo);
        if (probedDuration) {
          metadata.duration = probedDuration;
          metadata.durationFormatted = formatDuration(probedDuration);
          metadata.durationSource = 'media-header';
        }
      }
    } catch (primaryError) {
      if (detectPlatform(url).platform !== 'tiktok') throw primaryError;
      console.warn(`[downloader] yt-dlp fallo para TikTok (${primaryError.code || 'UNKNOWN'}); usando respaldo TikWM.`);
      metadata = await getTikTokFallbackInfo(url, primaryError);
    }
    infoCache.set(url, { data: metadata, expiresAt: Date.now() + INFO_CACHE_TTL_MS });
    return metadata;
  })().finally(() => pendingInfoRequests.delete(url));

  pendingInfoRequests.set(url, request);
  return request;
}

export function buildVideoFormatSelector(quality, formatDetails = null) {
  const selectedQuality = Number.parseInt(quality, 10);
  if (!Number.isFinite(selectedQuality) || selectedQuality < 100 || selectedQuality > 8192) {
    throw new MediaError('INVALID_RESOLUTION', 'La resolucion seleccionada no es valida.', 400);
  }
  const actualWidth = Number(formatDetails?.width) || 0;
  const actualHeight = Number(formatDetails?.height) || 0;
  const filter = actualWidth && actualHeight
    ? `[width=${actualWidth}][height=${actualHeight}]`
    : `[height=${selectedQuality}]`;

  return `bestvideo${filter}+bestaudio[ext=m4a]/bestvideo${filter}+bestaudio/best${filter}[ext=mp4]/best${filter}`;
}

function buildAsciiFilename(filename) {
  const ascii = filename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim();
  return ascii || 'download';
}

export async function processDownload(req, res) {
  const {
    url: rawUrl,
    format = 'mp3',
    quality = '320',
    resolution,
    customPath,
    directSaveOnly,
    jobId
  } = req.query;

  const requestsCustomPath = Object.prototype.hasOwnProperty.call(req.query, 'customPath');
  const requestsDirectSave = directSaveOnly === 'true' || String(directSaveOnly) === '1';
  if (process.env.MC_MUSIC_DESKTOP !== 'true' && (requestsCustomPath || requestsDirectSave)) {
    const message = 'Guardar en una carpeta del PC solo esta disponible en la aplicacion de escritorio local.';
    finishDownloadProgress(jobId, message);
    return res.status(403).json({ error: message, code: 'DESKTOP_ONLY' });
  }

  let proc = null;
  let tempFilePath = null;
  let tempFilePrefix = null;
  let cancelled = false;
  let responseStarted = false;
  let activeReadStream = null;

  const deleteFileWithRetry = (filePath, attempt = 0) => {
    fs.unlink(filePath, (error) => {
      if (error && error.code !== 'ENOENT' && attempt < 6) {
        setTimeout(() => deleteFileWithRetry(filePath, attempt + 1), 300 * (attempt + 1));
      }
    });
  };

  const removeTemporaryFiles = () => {
    if (!tempFilePrefix || !fs.existsSync(tempDir)) return;
    let matchingFiles = [];
    try {
      matchingFiles = fs.readdirSync(tempDir)
        .filter((name) => name.startsWith(`${tempFilePrefix}.`))
        .map((name) => path.join(tempDir, name));
    } catch {
      return;
    }

    for (const matchingFile of matchingFiles) {
      deleteFileWithRetry(matchingFile);
    }
  };

  const cancelDownload = () => {
    if (cancelled) return;
    cancelled = true;
    console.log('[downloader] Descarga cancelada por el cliente.');

    if (proc && !proc.killed) {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, removeTemporaryFiles);
      } else {
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          proc.kill('SIGTERM');
        }
      }
    }
    activeReadStream?.destroy();
    if (responseStarted && !res.destroyed) res.destroy();
    removeTemporaryFiles();
    finishDownloadProgress(jobId, 'Descarga cancelada.');
    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.status(499).json({ error: 'Descarga cancelada.', code: 'DOWNLOAD_CANCELLED' });
    }
  };

  registerDownloadCancellation(jobId, cancelDownload);
  req.on('aborted', () => {
    if (!responseStarted) cancelDownload();
  });
  res.on('close', () => {
    if (!res.writableEnded && !responseStarted) cancelDownload();
  });

  if (!isValidMediaUrl(rawUrl)) {
    const message = 'La URL proporcionada no es compatible.';
    finishDownloadProgress(jobId, message);
    return res.status(400).json({ error: message, code: 'INVALID_URL' });
  }
  if (!['mp3', 'mp4'].includes(String(format))) {
    finishDownloadProgress(jobId, 'El formato solicitado no es valido.');
    return res.status(400).json({ error: 'El formato solicitado no es valido.', code: 'INVALID_FORMAT' });
  }

  updateDownloadProgress(jobId, 1, 'preparing');
  const url = normalizeMediaUrl(rawUrl);

  let info;
  try {
    info = await getVideoInfo(url);
  } catch (error) {
    if (cancelled || res.destroyed) return;
    finishDownloadProgress(jobId, error.message);
    return res.status(error.statusCode || 422).json({ error: error.message, code: error.code || 'INFO_ERROR' });
  }
  if (cancelled || res.destroyed) return;
  if (info.isLive) {
    const message = 'Las transmisiones en vivo deben finalizar antes de descargarse.';
    finishDownloadProgress(jobId, message);
    return res.status(409).json({ error: message, code: 'LIVE_NOT_FINISHED' });
  }

  let selectedResolution = null;
  if (format === 'mp4') {
    const available = info.videoResolutions.map(Number).filter(Number.isFinite);
    selectedResolution = resolution ? Number.parseInt(resolution, 10) : available[0];
    if (!available.includes(selectedResolution)) {
      const message = `La resolucion ${resolution || ''}p no esta disponible. Opciones: ${available.join('p, ')}p.`;
      finishDownloadProgress(jobId, message);
      return res.status(409).json({
        error: message,
        code: 'FORMAT_UNAVAILABLE',
        availableResolutions: info.videoResolutions
      });
    }
  }

  updateDownloadProgress(jobId, 5, 'starting');
  const cleanTitle = sanitizeFilename(info.title);
  const fileExt = format === 'mp4' ? 'mp4' : 'mp3';
  const fileName = `${cleanTitle}.${fileExt}`;
  const safeId = String(info.id || 'media').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'media';
  tempFilePrefix = `${safeId}_${Date.now()}`;
  tempFilePath = path.join(tempDir, `${tempFilePrefix}.${fileExt}`);
  const outputTemplate = path.join(tempDir, `${tempFilePrefix}.%(ext)s`);
  const directMediaUrl = info[DIRECT_MEDIA_URL] || '';
  const directMediaHeaders = info[DIRECT_MEDIA_HEADERS] || {};

  const deliverFile = (elapsedSeconds) => {
    if (cancelled || res.destroyed) {
      removeTemporaryFiles();
      return;
    }
    if (!fs.existsSync(tempFilePath)) {
      const message = 'El conversor termino sin producir el archivo solicitado.';
      finishDownloadProgress(jobId, message);
      if (!res.headersSent) res.status(500).json({ error: message, code: 'OUTPUT_MISSING' });
      return;
    }

    updateDownloadProgress(jobId, 95, 'finalizing');
    const targetFolderPath = typeof customPath === 'string' ? customPath.trim() : '';
    let savedToCustomFolder = null;

    if (targetFolderPath) {
      const folderCheck = validateAndPrepareFolder(targetFolderPath);
      if (!folderCheck.valid) {
        removeTemporaryFiles();
        finishDownloadProgress(jobId, folderCheck.error);
        return res.status(400).json({ error: folderCheck.error, code: 'INVALID_FOLDER' });
      }
      try {
        savedToCustomFolder = path.join(folderCheck.path, fileName);
        fs.copyFileSync(tempFilePath, savedToCustomFolder);
      } catch (copyError) {
        console.error('[downloader] No se pudo guardar en la carpeta elegida:', copyError.message);
        savedToCustomFolder = null;
      }
    }

    if (directSaveOnly === 'true' || String(directSaveOnly) === '1') {
      if (!savedToCustomFolder) {
        removeTemporaryFiles();
        const message = 'No se pudo guardar el archivo en la carpeta seleccionada.';
        finishDownloadProgress(jobId, message);
        return res.status(400).json({ error: message, code: 'DIRECT_SAVE_FAILED' });
      }
      removeTemporaryFiles();
      finishDownloadProgress(jobId);
      return res.json({ success: true, savedToPath: savedToCustomFolder, fileName, elapsedSec: elapsedSeconds });
    }

    const stat = fs.statSync(tempFilePath);
    const asciiFilename = buildAsciiFilename(fileName);
    updateDownloadProgress(jobId, 97, 'transferring');
    responseStarted = true;
    res.writeHead(200, {
      'Content-Type': format === 'mp4' ? 'video/mp4' : 'audio/mpeg',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Saved-Folder': savedToCustomFolder ? encodeURIComponent(savedToCustomFolder) : '',
      'X-Media-Resolution': selectedResolution ? String(selectedResolution) : '',
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Saved-Folder, X-Media-Resolution'
    });

    activeReadStream = fs.createReadStream(tempFilePath);
    activeReadStream.pipe(res);
    activeReadStream.on('error', (error) => {
      console.error('[downloader] Error transmitiendo el archivo:', error.message);
      finishDownloadProgress(jobId, 'Error transmitiendo el archivo descargado.');
      removeTemporaryFiles();
    });
    res.on('finish', () => {
      finishDownloadProgress(jobId);
      removeTemporaryFiles();
    });
    res.on('close', () => removeTemporaryFiles());
  };

  const ensureCompatibleDirectMp4 = (onReady) => {
    const sourceCodec = String(info.videoFormats?.[0]?.codec || '').toLowerCase();
    const alreadyCompatible = /^(?:h264|avc1)$/.test(sourceCodec);
    if (!directMediaUrl || format !== 'mp4' || alreadyCompatible) {
      onReady();
      return;
    }

    // TikTok suele servir el HD en HEVC/H.265. Aunque sea un MP4 valido, muchos
    // telefonos lo muestran como "no compatible". Se conserva la resolucion y
    // se convierte a H.264 + AAC, el perfil con mayor compatibilidad movil/PC.
    const compatiblePath = path.join(tempDir, `${tempFilePrefix}.compatible.mp4`);
    updateDownloadProgress(jobId, 93, 'converting');
    const ffmpegArgs = [
      '-y',
      '-hide_banner',
      '-nostdin',
      '-i', tempFilePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      compatiblePath
    ];
    proc = spawn(getFfmpegPath(), ffmpegArgs, { windowsHide: true, detached: process.platform !== 'win32' });
    let conversionError = '';
    let conversionHandled = false;

    proc.stderr.on('data', (chunk) => {
      conversionError = `${conversionError}${chunk.toString()}`.slice(-12000);
    });
    proc.once('error', (error) => {
      if (conversionHandled || cancelled) return;
      conversionHandled = true;
      proc = null;
      console.error('[downloader] No se pudo iniciar la conversion H.264:', error.message);
      removeTemporaryFiles();
      const message = 'No se pudo convertir el video TikTok a un formato compatible.';
      finishDownloadProgress(jobId, message);
      if (!res.headersSent) res.status(500).json({ error: message, code: 'TIKTOK_COMPATIBILITY_CONVERSION_FAILED' });
    });
    proc.once('close', (code) => {
      proc = null;
      if (conversionHandled || cancelled) {
        removeTemporaryFiles();
        return;
      }
      conversionHandled = true;
      if (code !== 0 || !fs.existsSync(compatiblePath)) {
        console.error('[downloader] FFmpeg no pudo crear MP4 H.264:', conversionError.slice(-3000));
        removeTemporaryFiles();
        const message = 'No se pudo convertir el video TikTok a H.264 compatible.';
        finishDownloadProgress(jobId, message);
        if (!res.headersSent) res.status(500).json({ error: message, code: 'TIKTOK_COMPATIBILITY_CONVERSION_FAILED' });
        return;
      }
      fs.rmSync(tempFilePath, { force: true });
      fs.renameSync(compatiblePath, tempFilePath);
      onReady();
    });
  };

  const ffmpegExecPath = path.resolve(getFfmpegPath());
  const args = [
    ...getCommonYtDlpArgs(),
    '--ffmpeg-location', ffmpegExecPath,
    '--concurrent-fragments', '4',
    '--check-formats',
    '--newline',
    '--no-color',
    '--progress-delta', '0.05',
    '--progress-template', 'download:MC_PROGRESS:%(progress._percent_str)s',
    '-o', outputTemplate
  ];
  if (directMediaUrl) {
    if (directMediaHeaders.Referer) args.push('--referer', directMediaHeaders.Referer);
    if (directMediaHeaders['User-Agent']) args.push('--user-agent', directMediaHeaders['User-Agent']);
  }

  if (format === 'mp3') {
    const audioBitrate = ['320', '256', '128'].includes(String(quality)) ? String(quality) : '320';
    args.push(
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', `${audioBitrate}K`
    );
  } else {
    const formatSelector = directMediaUrl
      ? 'best'
      : buildVideoFormatSelector(
          selectedResolution,
          info.videoFormats.find((item) => Number(item.quality) === selectedResolution)
        );
    args.push('-f', formatSelector, '--merge-output-format', 'mp4', '--remux-video', 'mp4');
  }
  args.push(directMediaUrl || url);

  const extractionMode = directMediaUrl ? ' (respaldo directo verificado)' : '';
  console.log(`[downloader] Descargando ${format.toUpperCase()} de ${info.platform}${extractionMode}: "${info.title}"`);
  const startedAt = Date.now();
  proc = spawn(getYtDlpPath(), args, getYtDlpProcessOptions({
    detached: process.platform !== 'win32'
  }));

  let stderrOutput = '';
  let latestProgress = 5;
  let spawnFailed = false;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const parseProgressLines = (buffer) => {
    const lines = buffer.split(/\r?\n/);
    const remaining = lines.pop() || '';
    
    for (const line of lines) {
      const match = line.match(/MC_PROGRESS:\s*([\d.]+)%/);
      if (match) {
        const sourceProgress = Number(match[1]);
        if (Number.isFinite(sourceProgress)) {
          const mappedProgress = Math.min(92.0, Math.max(5.0, Number((5 + sourceProgress * 0.87).toFixed(1))));
          if (mappedProgress > latestProgress) {
            latestProgress = mappedProgress;
            updateDownloadProgress(jobId, latestProgress, 'downloading');
          }
        }
      }
    }
    
    return remaining;
  };

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    stdoutBuffer = parseProgressLines(stdoutBuffer);
  });

  proc.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    stderrBuffer = parseProgressLines(stderrBuffer);
    
    const text = chunk.toString();
    stderrOutput = `${stderrOutput}${text}`.slice(-16000);
    if (/\[(?:ExtractAudio|Merger|VideoConvertor|FFmpeg)\]/i.test(text)) {
      updateDownloadProgress(jobId, 93, 'converting');
    }
  });

  proc.once('error', (error) => {
    spawnFailed = true;
    console.error('[downloader] No se pudo iniciar yt-dlp:', error.message);
    removeTemporaryFiles();
    finishDownloadProgress(jobId, 'No se pudo iniciar el extractor multimedia.');
    if (!res.headersSent && !cancelled) {
      res.status(500).json({ error: 'No se pudo iniciar el extractor multimedia.', code: 'SPAWN_ERROR' });
    }
  });

  proc.once('close', (exitCode) => {
    if (stdoutBuffer) {
      parseProgressLines(stdoutBuffer + '\n');
    }
    if (stderrBuffer) {
      parseProgressLines(stderrBuffer + '\n');
    }
    proc = null;
    if (spawnFailed || cancelled) {
      removeTemporaryFiles();
      return;
    }

    if (exitCode !== 0 || !fs.existsSync(tempFilePath)) {
      const failure = formatExtractionFailure(stderrOutput, exitCode);
      console.error(`[downloader] yt-dlp fallo (${failure.code}, exit ${exitCode}):`, stderrOutput.slice(-3000));
      removeTemporaryFiles();
      finishDownloadProgress(jobId, failure.message);
      if (!res.headersSent) {
        res.status(failure.statusCode).json({ error: failure.message, code: failure.code });
      }
      return;
    }

    ensureCompatibleDirectMp4(() => {
      const totalElapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[downloader] Conversion completada en ${totalElapsedSeconds}s: "${fileName}"`);
      deliverFile(totalElapsedSeconds);
    });
  });
}
