import React from 'react';
import { motion } from 'framer-motion';
import { Music, Video, Download, Check } from 'lucide-react';

export default function FormatSelector({
  videoInfo,
  format,
  setFormat,
  quality,
  setQuality,
  resolution,
  setResolution,
  onStartDownload,
  isDownloading
}) {
  // Lista dinámica de resoluciones de video extraídas directamente de YouTube
  const availableResolutions = (videoInfo && videoInfo.videoResolutions && videoInfo.videoResolutions.length > 0)
    ? videoInfo.videoResolutions
    : ['1080', '720', '480', '360'];

  const getResolutionLabel = (res) => {
    if (res === '2160') return '(4K Ultra HD - Máxima Calidad)';
    if (res === '1440') return '(2K QHD - Alta Calidad)';
    if (res === '1080') return '(1080p Full HD - Mejor Definición)';
    if (res === '720') return '(720p HD - Recomendado)';
    if (res === '480') return '(480p SD - Calidad Estándar)';
    if (res === '360') return '(360p - Ahorro de Datos)';
    if (res === '240') return '(240p - Baja Calidad)';
    return `(${res}p - Calidad Estándar)`;
  };

  return (
    <motion.div 
      className="format-card glass-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      {/* Pestañas de formato (MP3 vs MP4) */}
      <div className="format-tabs">
        <button
          type="button"
          className={`format-tab ${format === 'mp3' ? 'active' : ''}`}
          onClick={() => setFormat('mp3')}
          style={{ position: 'relative' }}
        >
          <Music size={18} />
          <span>Música (MP3)</span>
          {format === 'mp3' && (
            <motion.div
              layoutId="format-tab-glow"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(121, 40, 202, 0.3))',
                border: '1px solid var(--border-glow)',
                zIndex: -1
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>

        <button
          type="button"
          className={`format-tab ${format === 'mp4' ? 'active' : ''}`}
          onClick={() => setFormat('mp4')}
          style={{ position: 'relative' }}
        >
          <Video size={18} />
          <span>Video (MP4)</span>
          {format === 'mp4' && (
            <motion.div
              layoutId="format-tab-glow"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(121, 40, 202, 0.3))',
                border: '1px solid var(--border-glow)',
                zIndex: -1
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      </div>

      {/* Calidad de Audio MP3 */}
      {format === 'mp3' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Selecciona la calidad de audio:
          </span>
          <div className="quality-grid">
            {[
              { id: '320', title: '320 kbps', desc: '(Máxima Calidad HQ Audio)' },
              { id: '256', title: '256 kbps', desc: '(Alta Calidad)' },
              { id: '128', title: '128 kbps', desc: '(Tamaño Reducido)' }
            ].map((item) => (
              <motion.button
                key={item.id}
                type="button"
                className={`quality-option ${quality === item.id ? 'selected' : ''}`}
                onClick={() => setQuality(item.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="quality-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  {quality === item.id && <Check size={14} style={{ color: 'var(--accent-cyan)' }} />}
                  <span>{item.title}</span>
                </div>
                <div className="quality-desc">{item.desc}</div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Resolución de Video MP4 (Extraídas en tiempo real del video de YouTube) */}
      {format === 'mp4' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Selecciona la resolución disponible de este video:
          </span>
          <div className="quality-grid">
            {availableResolutions.map((res) => (
              <motion.button
                key={res}
                type="button"
                className={`quality-option ${resolution === res ? 'selected' : ''}`}
                onClick={() => setResolution(res)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="quality-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  {resolution === res && <Check size={14} style={{ color: '#c084fc' }} />}
                  <span>{res}p</span>
                </div>
                <div className="quality-desc">{getResolutionLabel(res)}</div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Botón Principal de Descarga */}
      <motion.button
        type="button"
        className="btn-primary"
        onClick={onStartDownload}
        disabled={isDownloading}
        whileHover={{ scale: isDownloading ? 1 : 1.02 }}
        whileTap={{ scale: isDownloading ? 1 : 0.98 }}
        style={{ marginTop: '0.5rem', background: format === 'mp4' ? 'linear-gradient(135deg, #7928ca, #f72585)' : undefined }}
      >
        <Download size={20} />
        <span>
          Descargar {format.toUpperCase()} ({format === 'mp3' ? `${quality}kbps` : `${resolution}p`})
        </span>
      </motion.button>
    </motion.div>
  );
}
