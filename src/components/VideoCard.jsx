import React from 'react';
import { motion } from 'framer-motion';
import { User, Clock, Eye, ExternalLink } from 'lucide-react';

export default function VideoCard({ videoInfo }) {
  if (!videoInfo) return null;

  return (
    <motion.div 
      className="video-preview-card glass-panel"
      initial={{ opacity: 0, scale: 0.96, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
    >
      <div className="thumbnail-container">
        <img
          src={videoInfo.thumbnail}
          alt={videoInfo.title}
          className="thumbnail-img"
        />
        <div className="duration-badge">
          {videoInfo.durationFormatted}
        </div>
      </div>

      <div className="video-meta">
        <h3 className="video-title" title={videoInfo.title}>
          {videoInfo.title}
        </h3>

        <div className="video-details">
          <span className="meta-item">
            <User size={14} />
            {videoInfo.author}
          </span>
          <span className="meta-item">
            <Eye size={14} />
            {videoInfo.views} vistas
          </span>
        </div>

        <motion.a
          href={videoInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            color: 'var(--accent-cyan)',
            textDecoration: 'none',
            marginTop: '0.4rem',
            fontWeight: 600
          }}
          whileHover={{ x: 3 }}
        >
          <span>Ver original en YouTube</span>
          <ExternalLink size={14} />
        </motion.a>
      </div>
    </motion.div>
  );
}
