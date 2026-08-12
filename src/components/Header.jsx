import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Download, RefreshCw, Sparkles, CheckCircle2, AlertCircle, ExternalLink, X } from 'lucide-react';

const STATUS_LABELS = {
  online: 'Servicio activo',
  waking: 'Iniciando servicio…',
  checking: 'Comprobando…',
  offline: 'Servicio sin conexión'
};

export default function Header({
  activeTab,
  setActiveTab,
  showDesktopSettings,
  serverStatus = 'checking',
  isNativeMobile = false,
  updateInfo = null
}) {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [manualResult, setManualResult] = useState(null);

  const statusLabel = isNativeMobile && serverStatus === 'online'
    ? 'App móvil lista'
    : STATUS_LABELS[serverStatus] || STATUS_LABELS.checking;

  const handleCheckUpdateClick = async () => {
    setModalOpen(true);
    setIsCheckingUpdate(true);
    setManualResult(null);

    try {
      const res = await fetch('/api/update/check');
      const data = await res.json();
      if (data?.updateAvailable) {
        setManualResult({
          type: 'update',
          version: data.latestVersion,
          url: data.downloadUrl
        });
      } else {
        setManualResult({
          type: 'latest',
          version: data.currentVersion || '1.0.0'
        });
      }
    } catch (err) {
      setManualResult({
        type: 'error',
        text: 'No se pudo verificar la actualización. Revisa tu conexión.'
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const hasUpdate = updateInfo?.updateAvailable || manualResult?.type === 'update';

  return (
    <header className="app-header glass-panel" style={{ position: 'relative' }}>
      {/* 1. TÍTULO Y SUBTÍTULO CON VERSIÓN (BAJO MC-MUSIC) */}
      <motion.div
        className="brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div
          className="brand-icon"
          style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            width: '28px',
            height: '28px',
            overflow: 'hidden',
            borderRadius: '6px'
          }}
        >
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span className="brand-title" style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.3px' }}>
            MC-Music
          </span>
          <span style={{ fontSize: '0.72rem', color: '#00f2fe', fontWeight: 700, letterSpacing: '0.5px' }}>
            v1.0.0
          </span>
        </div>
      </motion.div>

      {/* 2. NAVEGACIÓN Y BOTÓN VER ACTUALIZACIÓN AL LADO DE "CARPETA EN PC" */}
      {showDesktopSettings && (
        <nav className="header-navigation" aria-label="Navegación principal">
          <button
            type="button"
            onClick={() => setActiveTab('downloader')}
            className={`header-tab ${activeTab === 'downloader' ? 'active' : ''}`}
          >
            <Download size={15} />
            <span>Descargador Principal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`header-tab ${activeTab === 'settings' ? 'active' : ''}`}
          >
            <HardDrive size={15} />
            <span>Carpeta en PC</span>
          </button>

          {/* BOTÓN SOLICITADO AL LADO DE CARPETA EN PC */}
          <button
            type="button"
            onClick={handleCheckUpdateClick}
            className="header-tab"
            style={{
              position: 'relative',
              background: hasUpdate ? 'rgba(16, 185, 129, 0.15)' : undefined,
              border: hasUpdate ? '1px solid rgba(16, 185, 129, 0.4)' : undefined,
              color: hasUpdate ? '#10b981' : undefined
            }}
            title="Buscar si hay alguna actualización nueva"
          >
            <RefreshCw size={15} className={isCheckingUpdate ? 'spin' : ''} />
            <span>Buscar Actualización</span>

            {/* NOTIFICACIÓN EN EL BOTÓN SI HAY ACTUALIZACIÓN */}
            {hasUpdate && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 8px #10b981'
                }}
              />
            )}
          </button>
        </nav>
      )}

      {/* INDICADOR DE ESTADO DEL SERVIDOR */}
      <motion.div
        className={`server-status ${serverStatus}`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        title={statusLabel}
      >
        <span className="status-dot" />
        <span>{statusLabel}</span>
      </motion.div>

      {/* MODAL DE NOTIFICACIÓN DE ACTUALIZACIÓN */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            style={{
              position: 'absolute',
              top: '110%',
              right: '2rem',
              zIndex: 1000,
              width: '340px',
              padding: '1.2rem',
              borderRadius: '16px',
              background: '#0e131f',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                <Sparkles size={16} color="#00f2fe" />
                <span>Actualizaciones de MC-Music</span>
              </h4>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={16} />
              </button>
            </div>

            {isCheckingUpdate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Comprobando la versión más reciente...</span>
              </div>
            ) : manualResult?.type === 'update' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.88rem', fontWeight: 600 }}>
                  <Sparkles size={18} />
                  <span>¡Nueva versión v{manualResult.version} disponible!</span>
                </div>
                <a
                  href={manualResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #10b981, #00f2fe)',
                    color: '#090b10',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    textDecoration: 'none'
                  }}
                >
                  <span>Descargar Actualización</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            ) : manualResult?.type === 'latest' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#10b981', fontSize: '0.88rem' }}>
                <CheckCircle2 size={18} />
                <span>Tu aplicación está en la versión más reciente (v{manualResult.version}).</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff758f', fontSize: '0.88rem' }}>
                <AlertCircle size={18} />
                <span>{manualResult?.text || 'No se pudo comprobar.'}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
