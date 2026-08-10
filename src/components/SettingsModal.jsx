import React, { useState } from 'react';
import { X, Folder, FolderOpen, CheckCircle2, AlertCircle, Save, HardDrive, Music, Monitor, Download } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, folderPath, setFolderPath, autoSaveToPC, setAutoSaveToPC }) {
  const [tempPath, setTempPath] = useState(folderPath || 'C:\\Users\\Public\\Music\\MC-Music');
  const [statusMessage, setStatusMessage] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const quickPresets = [
    { label: 'Mi Música', path: 'C:\\Users\\Public\\Music\\MC-Music', icon: Music },
    { label: 'Escritorio', path: 'C:\\Users\\Public\\Desktop\\MC-Music', icon: Monitor },
    { label: 'Descargas', path: 'C:\\Users\\Public\\Downloads\\MC-Music', icon: Download },
  ];

  const handleValidatePath = async (pathToTest) => {
    const target = pathToTest || tempPath;
    setIsVerifying(true);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/settings/validate-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: target })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo verificar la carpeta.');
      }

      setTempPath(data.folderPath);
      setStatusMessage({ type: 'success', text: `¡Carpeta válida y lista!: "${data.folderPath}"` });
      return true;
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOpenExplorer = async () => {
    try {
      await fetch('/api/settings/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: tempPath })
      });
    } catch (err) {
      console.error('Error al abrir carpeta:', err);
    }
  };

  const handleSave = async () => {
    const isValid = await handleValidatePath(tempPath);
    if (isValid) {
      setFolderPath(tempPath);
      setStatusMessage({ type: 'success', text: '¡Configuración guardada correctamente!' });
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem',
      animation: 'fadeIn 0.25s ease-out'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '580px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative'
      }}>
        {/* Header del Modal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white'
            }}>
              <HardDrive size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700 }}>
                Configuración de Ubicación en PC
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Elige en qué carpeta de tu equipo se guardarán tus archivos MP3 y MP4
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-icon-action"
            onClick={onClose}
            style={{ borderRadius: '50%', padding: '0.5rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Input de la ruta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Ruta de la carpeta en tu disco duro:
          </label>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <input
              type="text"
              className="url-input"
              style={{ padding: '0.8rem 1rem', fontSize: '0.92rem' }}
              value={tempPath}
              onChange={(e) => setTempPath(e.target.value)}
              placeholder="Ejemplo: C:\Users\TuUsuario\Musica\MC-Music"
            />

            <button
              type="button"
              className="btn-icon-action"
              onClick={handleOpenExplorer}
              title="Abrir esta carpeta en el Explorador de Windows"
              style={{ whiteSpace: 'nowrap' }}
            >
              <FolderOpen size={16} />
              <span>Abrir</span>
            </button>
          </div>

          {/* Presets Rápidos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Rutas sugeridas:</span>
            {quickPresets.map((preset, idx) => {
              const IconComp = preset.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  className="btn-icon-action"
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => {
                    setTempPath(preset.path);
                    handleValidatePath(preset.path);
                  }}
                >
                  <IconComp size={12} />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Opciones de Guardado Directo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSaveToPC}
              onChange={(e) => setAutoSaveToPC(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-cyan)' }}
            />
            <div>
              <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>Guardar directamente en esta carpeta al descargar</span>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>El servidor depositará una copia del archivo MP3/MP4 directamente en esta ruta de tu PC.</p>
            </div>
          </label>
        </div>

        {statusMessage && (
          <div className={statusMessage.type === 'success' ? 'glass-panel' : 'error-banner'} style={{
            padding: '0.8rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            color: statusMessage.type === 'success' ? '#10b981' : '#ff758f',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            border: statusMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : undefined
          }}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-icon-action"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '0.7rem 1.6rem', fontSize: '0.95rem' }}
            onClick={handleSave}
            disabled={isVerifying}
          >
            <Save size={16} />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </div>
    </div>
  );
}
