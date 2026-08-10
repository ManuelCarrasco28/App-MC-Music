import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function DownloadProgress({ isDownloading, isCompleted, format, quality, resolution, progress, title, savedToPath, isDirectSave, onReset }) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
  useEffect(() => {
    if (isCompleted) {
      try {
        confetti({
          particleCount: 75,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#00f2fe', '#4facfe', '#7928ca', '#10b981']
        });
      } catch (err) {
        console.warn('Confetti error:', err);
      }
    }
  }, [isCompleted]);

  return (
    <motion.div 
      className="progress-card glass-panel"
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
    >
      {isDownloading ? (
        <>
          <div className="audio-visualizer">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--accent-cyan)' }}>
              Procesando y convirtiendo {format.toUpperCase()}...
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              "{title}"
            </p>
          </div>

          <div className="progress-bar-track">
            <motion.div 
              className="progress-bar-fill"
              initial={{ width: '0%' }}
              animate={{ width: `${safeProgress}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>

          <strong style={{ fontSize: '1rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-heading)' }}>
            {safeProgress}% completado
          </strong>

          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            Procesando {format === 'mp3' ? `audio MP3 a ${quality} kbps` : `video MP4 a ${resolution}p`}.
          </span>
        </>
      ) : isCompleted ? (
        <>
          <motion.div 
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <CheckCircle2 size={32} />
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'center' }}>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: '#10b981' }}>
              {isDirectSave ? '¡Guardado con éxito en tu PC!' : '¡Descarga completada!'}
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {isDirectSave && savedToPath
                ? `Tu archivo ${format.toUpperCase()} ha sido depositado en: ${savedToPath}`
                : `Tu archivo ${format.toUpperCase()} ha sido descargado en tu navegador.`}
            </p>
          </div>

          <motion.button
            type="button"
            className="btn-icon-action"
            onClick={onReset}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ marginTop: '0.5rem', padding: '0.7rem 1.4rem', fontSize: '0.95rem' }}
          >
            <RefreshCw size={16} />
            <span>Descargar otro tema o video</span>
          </motion.button>
        </>
      ) : null}
    </motion.div>
  );
}
