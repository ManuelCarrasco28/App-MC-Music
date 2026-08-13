import React from 'react';
import { motion } from 'framer-motion';
import { Music, Video, Download, Check } from 'lucide-react';

function normalizeVideoResolutions(videoInfo) {
  const values = Array.isArray(videoInfo?.videoResolutions) ? videoInfo.videoResolutions : [];
  const normalized = values
    .map((value) => {
      if (value && typeof value === 'object') {
        const height = Number(value.height ?? value.id);
        if (!Number.isFinite(height) || height <= 0) return null;
        return {
          id: String(height),
          label: value.label || `${height}p`,
          description: value.description || ''
        };
      }

      const match = String(value ?? '').match(/(\d{3,4})/);
      if (!match) return null;
      const height = Number(match[1]);
      return { id: String(height), label: `${height}p`, description: '' };
    })
    .filter(Boolean);

  const unique = new Map(normalized.map((item) => [item.id, item]));
  return [...unique.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function getResolutionLabel(resolution) {
  const labels = {
    2160: '4K Ultra HD',
    1440: '2K QHD',
    1080: 'Full HD (Recomendado)',
    720: 'Alta Definición HD',
    480: 'Definición Estándar (SD)',
    360: 'Ahorro de datos',
    240: 'Baja resolución'
  };
  return labels[resolution]
    ? `${resolution}p · ${labels[resolution]}`
    : `${resolution}p · Calidad disponible`;
}

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
  const extractedResolutions = normalizeVideoResolutions(videoInfo);
  const availableResolutions = extractedResolutions.length > 0
    ? extractedResolutions
    : [{ id: 'best', label: 'Original', description: 'Mejor calidad disponible en el enlace' }];

  const availableAudioQualities = (Array.isArray(videoInfo?.audioQualities)
    ? videoInfo.audioQualities
    : ['320', '256', '128'])
    .map(String)
    .filter((value) => ['320', '256', '192', '160', '128'].includes(value));

  const audioOptions = [
    { id: '320', title: '320 kbps', desc: 'Máxima calidad de salida' },
    { id: '256', title: '256 kbps', desc: 'Alta calidad' },
    { id: '192', title: '192 kbps', desc: 'Calidad equilibrada' },
    { id: '160', title: '160 kbps', desc: 'Tamaño moderado' },
    { id: '128', title: '128 kbps', desc: 'Tamaño reducido' }
  ].filter((item) => availableAudioQualities.includes(item.id));

  return (
    <motion.div
      className="format-card glass-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      <div className="format-tabs">
        <button
          type="button"
          className={`format-tab ${format === 'mp3' ? 'active' : ''}`}
          onClick={() => setFormat('mp3')}
        >
          <Music size={18} />
          <span>Música (MP3)</span>
        </button>

        <button
          type="button"
          className={`format-tab ${format === 'mp4' ? 'active' : ''}`}
          onClick={() => setFormat('mp4')}
        >
          <Video size={18} />
          <span>Video (MP4)</span>
        </button>
      </div>

      {format === 'mp3' && (
        <div className="quality-section">
          <span className="quality-heading">Selecciona el bitrate de salida MP3:</span>
          <div className="quality-grid">
            {audioOptions.map((item) => (
              <motion.button
                key={item.id}
                type="button"
                className={`quality-option ${quality === item.id ? 'selected' : ''}`}
                onClick={() => setQuality(item.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="quality-title">
                  {quality === item.id && <Check size={14} className="quality-check" />}
                  <span>{item.title}</span>
                </div>
                <div className="quality-desc">{item.desc}</div>
              </motion.button>
            ))}
          </div>
          <small className="quality-note">
            Se conserva el audio original y se convierte al bitrate elegido. Convertir a 320 kbps no aumenta una fuente de menor calidad.
          </small>
        </div>
      )}

      {format === 'mp4' && (
        <div className="quality-section">
          <span className="quality-heading">Calidades detectadas en el enlace:</span>
          <div className="quality-grid">
            {availableResolutions.map((option) => (
              <motion.button
                key={option.id}
                type="button"
                className={`quality-option ${String(resolution) === option.id ? 'selected' : ''}`}
                onClick={() => setResolution(option.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="quality-title">
                  {String(resolution) === option.id && <Check size={14} className="quality-check video" />}
                  <span>{option.label}</span>
                </div>
                <div className="quality-desc">
                  {option.description || getResolutionLabel(option.id)}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

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
          Descargar {format.toUpperCase()} ({format === 'mp3'
            ? `${quality} kbps`
            : resolution === 'best' ? 'calidad original' : `${resolution}p`})
        </span>
      </motion.button>
    </motion.div>
  );
}
