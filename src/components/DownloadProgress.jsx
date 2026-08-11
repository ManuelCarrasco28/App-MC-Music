import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

const STAGE_LABELS = {
  preparing: 'Preparando el contenido…',
  starting: 'Iniciando descarga…',
  downloading: 'Descargando desde la plataforma…',
  converting: 'Convirtiendo el archivo…',
  finalizing: 'Finalizando el archivo…',
  transferring: 'Guardando en tu dispositivo…'
};

export default function DownloadProgress({
  isDownloading,
  isCompleted,
  format,
  quality,
  resolution,
  progress,
  stage = 'preparing',
  title,
  savedToPath,
  isDirectSave,
  isNativeMobile,
  onCancel,
  onReset
}) {
  const numericProgress = Number(progress);
  const hasDeterminateProgress = Number.isFinite(numericProgress) && numericProgress >= 0;
  const safeProgress = Math.min(100, Math.max(0, Math.round(numericProgress || 0)));

  useEffect(() => {
    if (!isCompleted) return;
    try {
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#00f2fe', '#4facfe', '#7928ca', '#10b981']
      });
    } catch (error) {
      console.warn('No se pudo mostrar la animación final:', error);
    }
  }, [isCompleted]);

  const completionTitle = isDirectSave
    ? '¡Guardado con éxito en tu PC!'
    : '¡Descarga completada!';
  const defaultLocation = isNativeMobile
    ? 'Galería / Descargas del teléfono'
    : 'Descargas del navegador';

  return (
    <motion.div
      className="progress-card glass-panel"
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      {isDownloading ? (
        <>
          <div className="audio-visualizer" aria-hidden="true">
            <div className="bar" /><div className="bar" /><div className="bar" /><div className="bar" /><div className="bar" />
          </div>

          <div className="progress-copy">
            <h4>{STAGE_LABELS[stage] || `Procesando ${format.toUpperCase()}…`}</h4>
            <p title={title}>“{title}”</p>
          </div>

          <div className={`progress-bar-track ${hasDeterminateProgress ? '' : 'indeterminate'}`}>
            <motion.div
              className="progress-bar-fill"
              initial={{ width: '0%' }}
              animate={{ width: hasDeterminateProgress ? `${safeProgress}%` : '35%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>

          <strong className="progress-percentage">
            {hasDeterminateProgress ? `${safeProgress}% completado` : 'Procesando…'}
          </strong>

          <span className="progress-detail">
            {format === 'mp3'
              ? `Salida MP3 a ${quality} kbps.`
              : resolution === 'best' ? 'Mejor calidad original disponible.' : `Video MP4 a ${resolution}p.`}
          </span>

          <motion.button
            type="button"
            className="btn-cancel-download"
            onClick={onCancel}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <XCircle size={18} />
            <span>Cancelar descarga</span>
          </motion.button>
        </>
      ) : isCompleted ? (
        <>
          <motion.div
            className="completion-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <CheckCircle2 size={32} />
          </motion.div>

          <div className="completion-copy">
            <h4>{completionTitle}</h4>
            <div className="saved-location">
              <span className="saved-location-label">Ubicación:</span>
              <strong>{savedToPath || defaultLocation}</strong>
              {isNativeMobile && (
                <small>Abre la app “Galería” o “Fotos” de tu teléfono, o revisa la carpeta Descargas.</small>
              )}
            </div>
          </div>

          <motion.button
            type="button"
            className="btn-icon-action completion-reset"
            onClick={onReset}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCw size={16} />
            <span>Descargar otro contenido</span>
          </motion.button>
        </>
      ) : null}
    </motion.div>
  );
}
