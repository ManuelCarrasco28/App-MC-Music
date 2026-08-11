import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserRound, Eye, ExternalLink, ImageOff } from 'lucide-react';

function hasValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized && !['--', '--:--', '00:00', '0'].includes(normalized);
}

function getSafeThumbUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const clean = rawUrl.trim();
  if (!clean) return '';
  if (clean.includes('wsrv.nl')) return clean;
  // Proxy seguro para evitar bloqueos CORS/Hotlinking en TikTok, Instagram y Facebook en WebView
  if (clean.includes('tiktokcdn') || clean.includes('cdninstagram') || clean.includes('fbcdn') || clean.includes('tikwm')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(clean)}`;
  }
  return clean;
}

export default function VideoCard({ videoInfo, onOpenOriginal }) {
  const [thumbIndex, setThumbIndex] = useState(0);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const rawThumbs = Array.isArray(videoInfo.thumbnails) && videoInfo.thumbnails.length > 0
    ? videoInfo.thumbnails
    : [videoInfo.thumbnail, videoInfo.cover, videoInfo.originCover].filter(Boolean);

  const availableThumbs = rawThumbs.map(getSafeThumbUrl).filter(Boolean);

  useEffect(() => {
    setThumbIndex(0);
    setThumbnailFailed(false);
  }, [videoInfo.thumbnail, videoInfo.id]);

  const currentThumbUrl = availableThumbs[thumbIndex] || getSafeThumbUrl(videoInfo.thumbnail);

  const handleImageError = () => {
    if (thumbIndex < availableThumbs.length - 1) {
      setThumbIndex((prev) => prev + 1);
    } else {
      setThumbnailFailed(true);
    }
  };

  const hasDuration = hasValue(videoInfo.durationFormatted);
  const hasViews = hasValue(videoInfo.views);

  return (
    <motion.div
      className="video-preview-card glass-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <div className={`thumbnail-container ${videoInfo.isVertical ? 'vertical-media' : ''}`}>
        {currentThumbUrl && !thumbnailFailed ? (
          <img
            src={currentThumbUrl}
            alt={`Miniatura de ${videoInfo.title}`}
            className="thumbnail-img"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={handleImageError}
          />
        ) : (
          <div className="thumbnail-placeholder" role="img" aria-label="Miniatura no disponible">
            <ImageOff size={30} />
            <span>Miniatura no disponible</span>
          </div>
        )}
        {hasDuration && <div className="duration-badge">{videoInfo.durationFormatted}</div>}
      </div>

      <div className="video-meta">
        {videoInfo.platformLabel && (
          <div
            className="platform-badge"
            style={{ '--platform-color': videoInfo.badgeColor || '#00f2fe' }}
          >
            {videoInfo.platformLabel}
          </div>
        )}

        <h3 className="video-title" title={videoInfo.title}>{videoInfo.title}</h3>

        <div className="video-details">
          {videoInfo.author && (
            <div className="meta-item">
              <UserRound size={15} />
              <span>{videoInfo.author}</span>
            </div>
          )}
          {hasViews && (
            <div className="meta-item">
              <Eye size={15} />
              <span>{videoInfo.views} vistas</span>
            </div>
          )}
        </div>

        <a
          href={videoInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="original-link"
          onClick={onOpenOriginal}
        >
          <span>Ver enlace original</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </motion.div>
  );
}
