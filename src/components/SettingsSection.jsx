import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Save, Music, Video, X, ArrowLeft, FolderSearch, Loader2 } from 'lucide-react';

export default function SettingsSection({
  mp3FolderPath,
  setMp3FolderPath,
  mp4FolderPath,
  setMp4FolderPath,
  onSwitchToDownloader
}) {
  const [tempMp3Path, setTempMp3Path] = useState(mp3FolderPath || '');
  const [tempMp4Path, setTempMp4Path] = useState(mp4FolderPath || '');

  const [statusMessage, setStatusMessage] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pickingMp3, setPickingMp3] = useState(false);
  const [pickingMp4, setPickingMp4] = useState(false);

  const handleValidateSingleFolder = async (folderPath) => {
    if (!folderPath || !folderPath.trim()) return '';
    const response = await fetch('/api/settings/validate-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: folderPath.trim() })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo acceder a la carpeta.');
    return data.folderPath;
  };

  const handlePickFolder = async (setPathFunc, setPickingFlag) => {
    setStatusMessage(null);
    setPickingFlag(true);
    try {
      const response = await fetch('/api/settings/pick-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();

      if (response.ok && data.folderPath && data.folderPath.trim()) {
        setPathFunc(data.folderPath.trim());
      } else if (data.error && !data.error.includes('cancelada')) {
        setStatusMessage({
          type: 'error',
          text: data.error
        });
      }
    } catch (err) {
      console.warn('[SettingsSection] Error seleccionando carpeta:', err.message);
    } finally {
      setPickingFlag(false);
    }
  };

  const handleSaveAll = async () => {
    setStatusMessage(null);

    // VALIDACIÓN OBLIGATORIA: Ambas rutas (MP3 y MP4) deben estar ingresadas
    if (!tempMp3Path.trim() || !tempMp4Path.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Es obligatorio configurar ambas carpetas (Música MP3 y Videos MP4) antes de guardar.'
      });
      return;
    }

    setIsVerifying(true);
    try {
      const validMp3 = await handleValidateSingleFolder(tempMp3Path);
      const validMp4 = await handleValidateSingleFolder(tempMp4Path);

      setMp3FolderPath(validMp3);
      setMp4FolderPath(validMp4);
      setTempMp3Path(validMp3);
      setTempMp4Path(validMp4);

      setStatusMessage({ type: 'success', text: '¡Ambas rutas guardadas con éxito! Redirigiendo al descargador...' });
      setTimeout(() => onSwitchToDownloader(), 800);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem', animation: 'fadeIn 0.3s ease-out' }}>

      {/* 1. SECCIÓN MP3 (MÚSICA) */}
      <div className="glass-panel" style={{ padding: '1.8rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{
            padding: '0.6rem', borderRadius: '10px',
            background: 'rgba(0, 242, 254, 0.15)', color: 'var(--accent-cyan)',
            border: '1px solid rgba(0, 242, 254, 0.3)'
          }}>
            <Music size={22} />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              Carpeta para Música (Archivos MP3) <span style={{ color: '#ff758f', fontSize: '1rem' }}>*Obligatorio</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Lugar donde se guardarán automáticamente tus descargas de solo audio.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
            <input
              type="text"
              className="url-input"
              style={{ width: '100%', padding: '0.9rem 2.8rem 0.9rem 1.1rem', fontSize: '0.88rem' }}
              value={tempMp3Path}
              onChange={(e) => setTempMp3Path(e.target.value)}
              placeholder="Selecciona o escribe la ruta de tu carpeta de música..."
            />
            {tempMp3Path && (
              <button type="button"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setTempMp3Path('')}
                title="Limpiar este campo"
              ><X size={16} /></button>
            )}
          </div>
          <button
            type="button"
            className="btn-icon-action"
            onClick={() => handlePickFolder(setTempMp3Path, setPickingMp3)}
            disabled={pickingMp3}
            style={{ padding: '0.8rem 1.4rem', fontSize: '0.95rem', cursor: pickingMp3 ? 'wait' : 'pointer', minWidth: '170px', justifyContent: 'center' }}
            title="Abrir selector nativo de Windows"
          >
            {pickingMp3 ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderSearch size={18} />}
            <span>{pickingMp3 ? 'Seleccionando...' : 'Seleccionar Carpeta'}</span>
          </button>
        </div>
      </div>

      {/* 2. SECCIÓN MP4 (VIDEO) */}
      <div className="glass-panel" style={{ padding: '1.8rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{
            padding: '0.6rem', borderRadius: '10px',
            background: 'rgba(121, 40, 202, 0.2)', color: '#c084fc',
            border: '1px solid rgba(121, 40, 202, 0.4)'
          }}>
            <Video size={22} />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 700, color: '#c084fc' }}>
              Carpeta para Videos (Archivos MP4) <span style={{ color: '#ff758f', fontSize: '1rem' }}>*Obligatorio</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Lugar donde se guardarán automáticamente tus descargas de video.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
            <input
              type="text"
              className="url-input"
              style={{ width: '100%', padding: '0.9rem 2.8rem 0.9rem 1.1rem', fontSize: '0.88rem' }}
              value={tempMp4Path}
              onChange={(e) => setTempMp4Path(e.target.value)}
              placeholder="Selecciona o escribe la ruta de tu carpeta de videos..."
            />
            {tempMp4Path && (
              <button type="button"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setTempMp4Path('')}
                title="Limpiar este campo"
              ><X size={16} /></button>
            )}
          </div>
          <button
            type="button"
            className="btn-icon-action"
            onClick={() => handlePickFolder(setTempMp4Path, setPickingMp4)}
            disabled={pickingMp4}
            style={{ padding: '0.8rem 1.4rem', fontSize: '0.95rem', cursor: pickingMp4 ? 'wait' : 'pointer', minWidth: '170px', justifyContent: 'center' }}
            title="Abrir selector nativo de Windows"
          >
            {pickingMp4 ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderSearch size={18} />}
            <span>{pickingMp4 ? 'Seleccionando...' : 'Seleccionar Carpeta'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={statusMessage.type === 'success' ? 'glass-panel' : 'error-banner'} style={{
          padding: '1rem 1.2rem', borderRadius: 'var(--radius-md)', fontSize: '0.95rem',
          color: statusMessage.type === 'success' ? '#10b981' : '#ff758f',
          display: 'flex', alignItems: 'center', gap: '0.8rem',
          border: statusMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.4)' : undefined,
          background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : undefined
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Botones de acción inferiores */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <button
          type="button"
          className="btn-icon-action"
          onClick={onSwitchToDownloader}
          style={{ padding: '0.9rem 1.6rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          <ArrowLeft size={18} />
          <span>Volver al Descargador Principal</span>
        </button>

        <button
          type="button"
          className="btn-primary"
          style={{ width: 'auto', padding: '0.9rem 2.2rem', fontSize: '1.05rem', cursor: 'pointer' }}
          onClick={handleSaveAll}
          disabled={isVerifying}
        >
          <Save size={20} />
          <span>Guardar Configuración de Rutas</span>
        </button>
      </div>
    </div>
  );
}
