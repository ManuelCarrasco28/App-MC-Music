/**
 * Capa de medios 100% Autónoma para Android/Capacitor y Web Client.
 *
 * Extracción completa cliente sin dependencias de servidores remotos:
 * - TikTok: Extracción directa vía TikWM API (Título, Autor, Duración, Miniatura, MP4 y MP3).
 * - YouTube: Metadatos completos oEmbed + HTML regex (Título, Autor, Duración, Miniatura, MP4 y MP3).
 * - Instagram: Metadatos OpenGraph (Título completo, Autor, Miniatura HD, MP4 y MP3).
 * - Facebook: Metadatos OpenGraph (Título completo, Autor, Miniatura HD, MP4 y MP3).
 * - Android Native: Transferencia e inserción en Galería vía MediaDownloader.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const API_STORAGE_KEY = 'mc_music_mobile_api_base';
const PREFERRED_MIRROR_KEY = 'mc_music_preferred_cobalt_mirror';
const INFO_TIMEOUT_MS = 14_000;
const TIKWM_TIMEOUT_MS = 14_000;
const DOWNLOAD_POLL_MS = 450;

const MediaDownloader = registerPlugin('MediaDownloader');

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function normalizeApiOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const hasProtocol = /^https?:\/\//i.test(raw);
    const parsed = new URL(hasProtocol ? raw : `http://${raw}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function getMobileApiOrigin() {
  const runtimeValue = typeof globalThis !== 'undefined'
    ? globalThis.MC_MUSIC_API_BASE_URL
    : '';
  let savedValue = '';
  try {
    savedValue = globalThis.localStorage?.getItem(API_STORAGE_KEY) || '';
  } catch {}

  return normalizeApiOrigin(
    runtimeValue
      || savedValue
      || import.meta.env?.VITE_MOBILE_API_BASE_URL
      || import.meta.env?.VITE_API_BASE_URL
  );
}

export function setMobileApiOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    globalThis.localStorage?.removeItem(API_STORAGE_KEY);
    return '';
  }
  const normalized = normalizeApiOrigin(raw);
  if (!normalized) {
    throw new Error('Ingresa una direccion de servidor valida (ej. http://192.168.1.15:5050).');
  }
  globalThis.localStorage?.setItem(API_STORAGE_KEY, normalized);
  return normalized;
}

function safeHostname(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(clean)
    ? clean
    : `https://${clean}`;
  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function detectPlatformClient(url) {
  if (!url || typeof url !== 'string') {
    return { platform: 'unknown', label: 'Enlace desconocido', badgeColor: '#6b7280' };
  }
  const clean = url.trim().toLowerCase();
  const host = safeHostname(clean);
  if (/(^|\.)youtube\.com|(^|\.)youtu\.be/.test(host)) {
    return { platform: 'youtube', label: 'YouTube', badgeColor: '#ff0000' };
  }
  if (/(^|\.)tiktok\.com/.test(host)) {
    return { platform: 'tiktok', label: 'TikTok', badgeColor: '#00f2fe' };
  }
  if (/(^|\.)instagram\.com/.test(host)) {
    return { platform: 'instagram', label: 'Instagram', badgeColor: '#e1306c' };
  }
  if (/(^|\.)facebook\.com|(^|\.)fb\.watch|(^|\.)fb\.gg/.test(host)) {
    return { platform: 'facebook', label: 'Facebook', badgeColor: '#1877f2' };
  }
  return { platform: 'generic', label: 'Media web', badgeColor: '#10b981' };
}

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanUrlValue(val) {
  if (!val) return '';
  let cleaned = decodeHtmlEntities(String(val).trim());
  cleaned = cleaned.replace(/\\/g, '');
  return cleaned;
}

function formatSec(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function normalizeDuration(value) {
  let seconds = Number(value) || 0;
  if (seconds > 24 * 60 * 60) seconds /= 1000;
  return Math.max(0, Math.round(seconds));
}

function normalizeViews(value) {
  if (typeof value === 'string' && value && value !== '--') return value;
  const number = Number(value) || 0;
  return number > 0 ? number.toLocaleString('es-ES') : '--';
}

function normalizeResolutions(values) {
  const heights = (Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(String(value), 10))
    .filter((height) => Number.isFinite(height) && height >= 144 && height <= 4320);
  return [...new Set(heights)].sort((a, b) => b - a).map(String);
}

function normalizeVideoInfo(rawInfo, cleanUrl, fallbackMeta) {
  const duration = normalizeDuration(
    rawInfo.duration
      ?? rawInfo.durationSeconds
      ?? rawInfo.video_duration
      ?? rawInfo.video?.duration
  );
  const rawHeight = Number(
    rawInfo.height
      ?? rawInfo.videoHeight
      ?? rawInfo.video?.height
      ?? 0
  );
  const rawWidth = Number(
    rawInfo.width
      ?? rawInfo.videoWidth
      ?? rawInfo.video?.width
      ?? 0
  );
  const detectedHeight = rawWidth && rawHeight
    ? Math.min(rawWidth, rawHeight)
    : rawHeight;
  const listedResolutions = normalizeResolutions(rawInfo.videoResolutions);
  const videoResolutions = listedResolutions.length
    ? listedResolutions
    : normalizeResolutions([detectedHeight || 720, 1080, 480]);

  const rawThumb = String(rawInfo.thumbnail || rawInfo.cover || rawInfo.originCover || '').trim();
  const thumbnail = rawThumb.startsWith('http://') ? rawThumb.replace('http://', 'https://') : rawThumb;

  const rawThumbList = (Array.isArray(rawInfo.thumbnails) ? rawInfo.thumbnails : [thumbnail])
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .map(t => t.startsWith('http://') ? t.replace('http://', 'https://') : t);

  return {
    ...rawInfo,
    id: String(rawInfo.id || `${fallbackMeta.platform}-${Date.now()}`),
    url: cleanUrl,
    title: decodeHtmlEntities(String(rawInfo.title || `Video de ${fallbackMeta.label}`)),
    author: decodeHtmlEntities(String(rawInfo.author || rawInfo.uploader || fallbackMeta.label)),
    duration,
    durationFormatted: duration ? formatSec(duration) : '--:--',
    thumbnail,
    thumbnails: rawThumbList,
    views: normalizeViews(rawInfo.views ?? rawInfo.view_count ?? rawInfo.play_count),
    audioQualities: Array.isArray(rawInfo.audioQualities) && rawInfo.audioQualities.length
      ? rawInfo.audioQualities.map(String)
      : ['320', '256', '128'],
    videoResolutions,
    platform: rawInfo.platform || fallbackMeta.platform,
    platformLabel: rawInfo.platformLabel || fallbackMeta.label,
    badgeColor: rawInfo.badgeColor || fallbackMeta.badgeColor,
    metadataSource: rawInfo.metadataSource || 'autonomous-client'
  };
}

function createAbortContext(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(new DOMException('Tiempo de espera agotado.', 'TimeoutError'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  };
}

async function fetchJson(url, { signal, timeoutMs = INFO_TIMEOUT_MS, ...options } = {}) {
  const abortContext = createAbortContext(signal, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: abortContext.signal });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : null;
    if (!response.ok) {
      throw new Error(payload?.error || payload?.text || `El servidor respondio HTTP ${response.status}.`);
    }
    if (!payload) throw new Error('El servidor no devolvio una respuesta JSON valida.');
    return payload;
  } finally {
    abortContext.cleanup();
  }
}

/* ==========================================================================
   EXTRACTORES AUTÓNOMOS DE METADATOS Y MEDIOS POR PLATAFORMA
   ========================================================================== */



async function getTikTokClientInfo(cleanUrl, meta, signal) {
  const endpoints = [
    `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`,
    `https://tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`,
    `https://api.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`
  ];
  let resData = null;
  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      resData = await fetchJson(endpoint, { signal, timeoutMs: 12_000 });
      if (resData?.code === 0 && resData?.data) break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!resData || resData.code !== 0 || !resData.data) {
    throw new Error(resData?.msg || lastErr?.message || 'TikTok no devolvio informacion compatible.');
  }

  const data = resData.data;
  const normalMp4 = data.play || data.hdplay || '';
  const hdMp4 = data.hdplay || data.play || '';
  const directMp4 = normalMp4;
  const thumbnailList = [data.cover, data.origin_cover].filter(Boolean);

  return normalizeVideoInfo({
    id: data.id || 'tiktok',
    title: data.title || 'Video de TikTok',
    author: data.author?.nickname || data.author?.unique_id || 'Usuario de TikTok',
    duration: data.duration || 0,
    thumbnail: thumbnailList[0] || '',
    thumbnails: thumbnailList,
    views: data.play_count || 0,
    videoResolutions: ['1080', '720'],
    directMp4,
    hdMp4,
    normalMp4,
    directMp3: data.music || data.music_info?.play || directMp4 || '',
    metadataSource: 'tikwm-client'
  }, cleanUrl, meta);
}

async function getYouTubeClientInfo(cleanUrl, meta, signal) {
  const videoId = cleanUrl.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || '';
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
  const info = await fetchJson(endpoint, { signal, timeoutMs: 10_000 });

  let durationSeconds = 0;
  if (videoId) {
    try {
      const htmlRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (durationMatch) {
          durationSeconds = Number(durationMatch[1]) || 0;
        }
      }
    } catch {}
  }

  return normalizeVideoInfo({
    id: videoId || 'youtube',
    title: info.title || 'Video de YouTube',
    author: info.author_name || 'Canal de YouTube',
    duration: durationSeconds,
    thumbnail: info.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
    videoResolutions: ['1080', '720', '480', '360'],
    audioQualities: ['320', '256', '128'],
    metadataSource: 'oembed-client'
  }, cleanUrl, meta);
}



async function getFacebookClientInfo(cleanUrl, meta, signal) {
  try {
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal
    });

    if (res.ok) {
      const html = await res.text();
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
        || html.match(/<title>([^<]+)<\/title>/i);
      
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+property="og:image:src"\s+content="([^"]+)"/i)
        || html.match(/"preferred_thumbnail"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i)
        || html.match(/"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i)
        || html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/i)
        || html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/i)
        || html.match(/"image"\s*:\s*"([^"]+)"/i);

      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);

      let title = ogDescMatch?.[1] || ogTitleMatch?.[1] || 'Video de Facebook';
      let author = 'Facebook';

      if (title.includes('|')) {
        const parts = title.split('|');
        title = parts[0].trim();
        author = parts[1].trim();
      }

      const ogVideoMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/i)
        || html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/i)
        || html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/i)
        || html.match(/hd_src\s*:\s*"([^"]+)"/i)
        || html.match(/sd_src\s*:\s*"([^"]+)"/i);

      let directMp4 = ogVideoMatch?.[1] ? cleanUrlValue(ogVideoMatch[1]) : '';
      if (directMp4.includes('lookaside.fbsbx.com') || directMp4.includes('fbsbx.com/lookaside')) {
        directMp4 = '';
      }

      return normalizeVideoInfo({
        id: 'facebook',
        title: decodeHtmlEntities(title),
        author: decodeHtmlEntities(author),
        thumbnail: ogImageMatch?.[1] ? cleanUrlValue(ogImageMatch[1]) : '',
        videoResolutions: ['1080', '720', '480'],
        audioQualities: ['320', '256', '128'],
        directMp4,
        metadataSource: 'facebook-opengraph-client'
      }, cleanUrl, meta);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  return normalizeVideoInfo({
    id: meta.platform,
    title: `Contenido de ${meta.label}`,
    author: meta.label,
    thumbnail: '',
    videoResolutions: ['1080', '720', '480'],
    audioQualities: ['320', '256', '128'],
    metadataSource: 'facebook-client'
  }, cleanUrl, meta);
}

export async function mobileGetVideoInfo(rawUrl, options = {}) {
  let cleanUrl = String(rawUrl || '').trim();
  if (cleanUrl && !/^[a-z][a-z\d+.-]*:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }
  const meta = detectPlatformClient(cleanUrl);
  if (meta.platform === 'instagram') {
    throw new Error('Instagram no está disponible en la versión móvil de la aplicación. Por favor, utiliza la versión para PC.');
  }
  if (!cleanUrl || ['unknown', 'generic'].includes(meta.platform)) {
    throw new Error('Pega un enlace valido de YouTube, TikTok o Facebook.');
  }

  // 1. Si tenemos servidor backend configurado y en línea, preferimos usar el backend
  const customOrigin = getMobileApiOrigin();
  if (customOrigin) {
    try {
      const payload = await fetchJson(`${customOrigin}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
        signal: options.signal,
        timeoutMs: options.timeoutMs || 8_000
      });
      return normalizeVideoInfo(payload, cleanUrl, meta);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      console.warn('[MC-Music] Servidor backend no disponible o falló la resolución. Intentando autónomamente:', error.message);
    }
  }

  // 2. Si no hay backend, o el backend falló, intentamos resolver autónomamente de forma local
  if (meta.platform === 'tiktok') {
    try {
      return await getTikTokClientInfo(cleanUrl, meta, options.signal);
    } catch (err) {
      console.warn('[MC-Music] Error cliente TikTok:', err.message);
    }
  }

  if (meta.platform === 'youtube') {
    try {
      return await getYouTubeClientInfo(cleanUrl, meta, options.signal);
    } catch (ytError) {
      console.warn('[MC-Music] Fallo oEmbed YouTube:', ytError.message);
    }
  }

  if (meta.platform === 'facebook') {
    try {
      return await getFacebookClientInfo(cleanUrl, meta, options.signal);
    } catch (fbError) {
      console.warn('[MC-Music] Fallo Facebook:', fbError.message);
    }
  }

  return normalizeVideoInfo({
    id: meta.platform,
    title: `Contenido de ${meta.label}`,
    author: meta.label,
    thumbnail: '',
    videoResolutions: ['1080', '720', '480'],
    audioQualities: ['320', '256', '128'],
    metadataSource: `${meta.platform}-client`
  }, cleanUrl, meta);
}

function sanitizeFileName(title, extension) {
  const clean = String(title || 'descarga')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 120) || 'descarga';
  return `${clean}.${extension}`;
}

function createJobId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Descarga cancelada.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException('Descarga cancelada.', 'AbortError'));
    };
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function downloadWithAndroidManager({ downloadUrl, fileName, mimeType, jobId, platform, onProgress, onStage, signal }) {
  let nativeId = null;
  let actualFileName = fileName;

  const abortNative = async () => {
    if (nativeId !== null) {
      try { await MediaDownloader.cancel({ id: nativeId }); } catch {}
    }
  };
  signal?.addEventListener('abort', abortNative, { once: true });

  try {
    if (signal?.aborted) throw new DOMException('Descarga cancelada.', 'AbortError');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Referer': platform === 'tiktok' ? 'https://www.tiktok.com/' :
                 platform === 'youtube' ? 'https://www.youtube.com/' :
                 platform === 'facebook' ? 'https://www.facebook.com/' :
                 platform === 'instagram' ? 'https://www.instagram.com/' : ''
    };

    const started = await MediaDownloader.download({
      url: downloadUrl,
      fileName,
      mimeType,
      title: fileName,
      platform,
      headers
    });

    nativeId = started?.id ?? started?.nativeId ?? null;
    actualFileName = started?.fileName || fileName;
    if (nativeId === null || nativeId === undefined) {
      throw new Error('Android no pudo asignar la descarga.');
    }

    if (signal?.aborted) {
      await abortNative();
      throw new DOMException('Descarga cancelada.', 'AbortError');
    }

    while (true) {
      const status = await MediaDownloader.getStatus({ id: nativeId });
      const downloadedBytes = Number(status.downloadedBytes) || 0;
      const totalBytes = Number(status.totalBytes) || 0;

      if (totalBytes > 0 && downloadedBytes >= 0) {
        onStage('transferring');
        const pct = (downloadedBytes / totalBytes) * 100;
        onProgress(Math.min(99, Math.round(pct)));
      } else if (downloadedBytes > 0) {
        onStage('transferring');
        onProgress(-1);
      }

      if (status.state === 'successful') {
        if (downloadedBytes <= 1024) {
          throw new Error('El servidor rechazó la descarga o envió un archivo vacío.');
        }
        onProgress(100);
        return {
          fileName: actualFileName,
          savedPathDisplay: `Galería / Descargas del teléfono > ${actualFileName}`,
          contentUri: status.localUri || '',
          totalBytes
        };
      }
      if (status.state === 'failed' || status.state === 'not_found') {
        throw new Error(status.message || 'Android no pudo completar la descarga.');
      }
      await delay(DOWNLOAD_POLL_MS, signal);
    }
  } catch (error) {
    if (signal?.aborted && error?.name !== 'AbortError') {
      throw new DOMException('Descarga cancelada.', 'AbortError');
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortNative);
  }
}

async function downloadWithFetch({ downloadUrl, fileName, jobId, onProgress, onStage, signal }) {
  try {
    onStage('downloading');
    const response = await fetch(downloadUrl, { signal });
    if (!response.ok) {
      throw new Error(`La descarga respondió HTTP ${response.status}.`);
    }

    const expectedBytes = Number(response.headers.get('content-length')) || 0;
    const reader = response.body?.getReader?.();
    const chunks = [];
    let receivedBytes = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.byteLength;
        if (expectedBytes > 0) {
          onProgress(Math.min(99, Math.round((receivedBytes / expectedBytes) * 100)));
        } else {
          onProgress(-1);
        }
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));
      receivedBytes = arrayBuffer.byteLength;
    }

    const bytes = concatChunks(chunks, receivedBytes);
    if (bytes.byteLength <= 1024) {
      throw new Error('El archivo descargado está vacío o es inválido.');
    }

    const blob = new Blob([bytes]);
    const blobUrl = URL.createObjectURL(blob);
    if (typeof document !== 'undefined') {
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      globalThis.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
    onProgress(100);
    return { fileName, savedPathDisplay: `Descargas del navegador > ${fileName}` };
  } finally {}
}

function concatChunks(chunks, totalSize) {
  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function mobileProcessDownload({
  videoInfo,
  format,
  quality = '320',
  resolution = '',
  onProgress = () => {},
  onStage = () => {},
  signal
}) {
  if (!videoInfo?.url) throw new Error('No hay un video listo para descargar.');
  if (!['mp3', 'mp4'].includes(format)) throw new Error('Formato de descarga no valido.');
  if (signal?.aborted) throw new DOMException('Descarga cancelada.', 'AbortError');

  const meta = detectPlatformClient(videoInfo.url);

  let latestProgress = 0;
  const reportProgress = (value) => {
    latestProgress = Math.max(latestProgress, Math.max(0, Math.min(100, Number(value) || 0)));
    onProgress(latestProgress);
  };

  const extension = format;
  const mimeType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
  const fileName = sanitizeFileName(videoInfo.title, extension);
  const jobId = createJobId();

  reportProgress(0);
  onStage('preparing');

  if (meta.platform === 'instagram') {
    throw new Error('Instagram no está disponible en la versión móvil de la aplicación. Por favor, utiliza la versión para PC.');
  }
  let directDownloadUrl = '';
  const customOrigin = getMobileApiOrigin();

  if (meta.platform === 'tiktok') {
    try {
      const freshData = await getTikTokClientInfo(videoInfo.url, meta, signal);
      const useHD = format === 'mp4' && String(resolution) === '1080' && Boolean(customOrigin);
      directDownloadUrl = format === 'mp4'
        ? (useHD ? (freshData.hdMp4 || freshData.directMp4) : freshData.directMp4)
        : (freshData.directMp3 || freshData.directMp4);
    } catch (err) {
      console.warn('[MC-Music] Error cliente TikTok:', err.message);
    }
  } else if (meta.platform === 'facebook' && (!customOrigin || format === 'mp4')) {
    try {
      const freshData = await getFacebookClientInfo(videoInfo.url, meta, signal);
      if (freshData.directMp4) {
        directDownloadUrl = freshData.directMp4;
      }
    } catch (err) {
      console.warn('[MC-Music] Error cliente Facebook:', err.message);
    }
  }

  // Resolver stream binario de descarga directa para YouTube, Instagram y Facebook.
  // Si customOrigin está definido, preferimos usar el backend para todas las descargas para asegurar conversión de audio, remuxing y compatibilidad de códecs (como H.264).
  const needsResolution = Boolean(customOrigin) || !directDownloadUrl ||
    directDownloadUrl.includes('youtube.com') ||
    directDownloadUrl.includes('youtu.be') ||
    directDownloadUrl.includes('instagram.com') ||
    directDownloadUrl.includes('facebook.com');

  if (needsResolution) {
    if (customOrigin) {
      const params = new URLSearchParams({
        url: videoInfo.url,
        format,
        quality: format === 'mp3' ? String(quality || '320') : '',
        resolution: format === 'mp4' ? String(resolution || '720') : '',
        jobId
      });
      directDownloadUrl = `${customOrigin}/api/download?${params.toString()}`;
    } else {
      // Intentar resolver via espejo de Cobalt con ordenación inteligente y reintentos
      const baseCobaltInstances = [
        'https://api.cobalt.tools/',
        'https://cobalt.qtfy.dev/',
        'https://cobalt.fast-serve.net/',
        'https://cobalt.stream/',
        'https://cobalt.cn.eu.org/',
        'https://dog.kittycat.boo/',
        'https://cobaltapi.kittycat.boo/',
        'https://rue-cobalt.xenon.zone/',
        'https://cobalt.hostux.net/'
      ];

      // 3. Orden inteligente: Si un espejo funcionó previamente, se prueba primero
      let preferredInstance = '';
      try { preferredInstance = globalThis.localStorage?.getItem(PREFERRED_MIRROR_KEY) || ''; } catch {}

      const cobaltInstances = [...baseCobaltInstances];
      if (preferredInstance && cobaltInstances.includes(preferredInstance)) {
        cobaltInstances.sort((a, b) => (a === preferredInstance ? -1 : b === preferredInstance ? 1 : 0));
      }

      const overallStart = Date.now();
      let testedCount = 0;

      for (const instance of cobaltInstances) {
        // Límite global: Máximo 4 espejos probados o 45 segundos de tiempo total acumulado
        if (testedCount >= 4 || (Date.now() - overallStart) >= 45_000) break;
        if (signal?.aborted) break;

        testedCount++;
        let resolvedFromMirror = '';

        // 2. Reintentos con backoff (máximo 2 intentos por espejo para errores temporales)
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (signal?.aborted) break;
          try {
            const cobaltRes = await fetch(instance, {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: videoInfo.url,
                videoQuality: resolution || '720',
                downloadMode: format === 'mp3' ? 'audio' : 'auto',
                audioFormat: 'mp3'
              }),
              signal
            });

            if (cobaltRes.ok) {
              const cData = await cobaltRes.json();
              if (cData.url) {
                resolvedFromMirror = cData.url;
                break;
              }
            } else if ([403, 429, 502, 503, 504].includes(cobaltRes.status) && attempt === 1) {
              // Esperar 2.5s antes del reintento temporal
              await delay(2500, signal);
            } else {
              break;
            }
          } catch (err) {
            if (signal?.aborted) break;
            if (attempt === 1) {
              await delay(2500, signal).catch(() => {});
            }
          }
        }

        if (resolvedFromMirror) {
          directDownloadUrl = resolvedFromMirror;
          try { globalThis.localStorage?.setItem(PREFERRED_MIRROR_KEY, instance); } catch {}
          break;
        }
      }
    }
  }

  let isDirectResolved = false;
  if (directDownloadUrl) {
    try {
      const parsedUrl = new URL(directDownloadUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      const isBlockedHost = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com)$/.test(hostname);
      isDirectResolved = !isBlockedHost;
    } catch {
      isDirectResolved = Boolean(directDownloadUrl);
    }
  }

  if (!isDirectResolved) {
    throw new Error("No se pudo obtener el enlace de descarga. Todos los servidores de resolución están fuera de línea o saturados. Inténtalo de nuevo en unos minutos.");
  }

  if (isNativeAndroid()) {
    return downloadWithAndroidManager({
      downloadUrl: directDownloadUrl,
      fileName,
      mimeType,
      jobId,
      platform: meta.platform,
      onProgress: reportProgress,
      onStage,
      signal
    });
  }

  return downloadWithFetch({
    downloadUrl: directDownloadUrl,
    fileName,
    jobId,
    onProgress: reportProgress,
    onStage,
    signal
  });
}
