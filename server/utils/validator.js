/**
 * Validacion, deteccion y normalizacion de enlaces compatibles con MC-Music.
 * La lista cerrada de dominios evita que yt-dlp se use como proxy hacia URLs
 * internas del equipo (SSRF) y permite mostrar errores antes de iniciarlo.
 */

const PLATFORM_CONFIG = {
  youtube: {
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    label: 'YouTube',
    badgeColor: '#ff0000',
    icon: 'youtube'
  },
  tiktok: {
    hosts: ['tiktok.com'],
    label: 'TikTok',
    badgeColor: '#00f2fe',
    icon: 'tiktok'
  },
  instagram: {
    hosts: ['instagram.com', 'instagr.am'],
    label: 'Instagram',
    badgeColor: '#e1306c',
    icon: 'instagram'
  },
  facebook: {
    hosts: ['facebook.com', 'fb.watch', 'fb.com', 'fb.gg'],
    label: 'Facebook',
    badgeColor: '#1877f2',
    icon: 'facebook'
  }
};

function parseHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean || /\s/.test(clean)) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(clean)
    ? clean
    : `https://${clean}`;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && !['80', '443'].includes(parsed.port)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function matchesHost(hostname, allowedHosts) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function platformFromUrl(parsed) {
  if (!parsed) return 'unknown';
  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    if (matchesHost(parsed.hostname, config.hosts)) return platform;
  }
  return 'unknown';
}

function hasMediaPath(parsed, platform) {
  const path = parsed.pathname.replace(/\/{2,}/g, '/');
  if (platform === 'youtube') {
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return /^\/[A-Za-z0-9_-]{11}(?:\/|$)/.test(path);
    if (parsed.searchParams.get('v')?.match(/^[A-Za-z0-9_-]{11}$/)) return true;
    return /^\/(?:shorts|live|embed|v)\/[A-Za-z0-9_-]{11}(?:\/|$)/.test(path)
      || /^\/clip\/[A-Za-z0-9_-]+(?:\/|$)/.test(path);
  }

  // Los dominios cortos cambian de ruta con frecuencia. El extractor se ocupa
  // de resolver la redireccion, pero nunca aceptamos la raiz vacia del sitio.
  return path !== '/' && path.length > 1;
}

/** Devuelve true solo para enlaces multimedia de las plataformas soportadas. */
export function isValidMediaUrl(value) {
  const parsed = parseHttpUrl(value);
  const platform = platformFromUrl(parsed);
  return platform !== 'unknown' && hasMediaPath(parsed, platform);
}

export function isValidYoutubeUrl(value) {
  const parsed = parseHttpUrl(value);
  return platformFromUrl(parsed) === 'youtube' && hasMediaPath(parsed, 'youtube');
}

/** Metadatos visuales de la plataforma identificada. */
export function detectPlatform(value) {
  const parsed = parseHttpUrl(value);
  const platform = platformFromUrl(parsed);
  const config = PLATFORM_CONFIG[platform];

  if (!config) {
    return {
      platform: 'unknown',
      label: parsed ? 'Plataforma no compatible' : 'Enlace invalido',
      badgeColor: '#6b7280',
      icon: 'link'
    };
  }

  return {
    platform,
    label: config.label,
    badgeColor: config.badgeColor,
    icon: config.icon
  };
}

/** Extrae el identificador de un video de YouTube, incluidas URLs Shorts/live. */
export function extractVideoId(value) {
  const parsed = parseHttpUrl(value);
  if (platformFromUrl(parsed) !== 'youtube') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
  }

  const queryId = parsed.searchParams.get('v');
  if (/^[A-Za-z0-9_-]{11}$/.test(queryId || '')) return queryId;

  const pathMatch = parsed.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
  return pathMatch?.[1] || null;
}

/** Convierte cualquier variante conocida de YouTube a una URL watch estable. */
export function normalizeYoutubeUrl(value) {
  const videoId = extractVideoId(value);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  return normalizeMediaUrl(value);
}

/**
 * Elimina parametros de rastreo sin romper los identificadores necesarios de
 * Facebook. Las URLs cortas se conservan para que yt-dlp siga la redireccion.
 */
export function normalizeMediaUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return typeof value === 'string' ? value.trim() : '';

  const platform = platformFromUrl(parsed);
  if (platform === 'youtube') {
    const videoId = extractVideoId(parsed.toString());
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  }

  parsed.hash = '';
  if (platform === 'facebook') {
    const essential = new URLSearchParams();
    for (const key of ['v', 'story_fbid', 'id']) {
      const current = parsed.searchParams.get(key);
      if (current) essential.set(key, current);
    }
    parsed.search = essential.toString();
  } else {
    parsed.search = '';
  }

  return parsed.toString();
}
