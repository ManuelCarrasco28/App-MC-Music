/**
 * Utilidad de validación y extracción de ID de videos de YouTube.
 */

// Regex para validar URLs de YouTube (videos normales, shorts, youtu.be, mobile)
const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/**
 * Valida si un string es una URL válida de YouTube.
 * @param {string} url 
 * @returns {boolean}
 */
export function isValidYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim();
  return YOUTUBE_REGEX.test(cleanUrl);
}

/**
 * Extrae el ID único del video de YouTube a partir de la URL.
 * @param {string} url 
 * @returns {string|null}
 */
export function extractVideoId(url) {
  if (!isValidYoutubeUrl(url)) return null;
  const match = url.trim().match(YOUTUBE_REGEX);
  return match ? match[5] : null;
}

/**
 * Limpia y normaliza la URL de YouTube a un formato estándar.
 * @param {string} url 
 * @returns {string}
 */
export function normalizeYoutubeUrl(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return url.trim();
  return `https://www.youtube.com/watch?v=${videoId}`;
}
