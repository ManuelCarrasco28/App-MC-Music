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

  const handleCheckUpdateClick = async (e) => {
    e.stopPropagation();
    if (modalOpen && !isCheckingUpdate) {
      setModalOpen(false);
      return;
    }

    setModalOpen(true);
    setIsCheckingUpdate(true);
    setManualResult(null);

    try {
      const res = await fetch('/api/update/check');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        setTimeout(() => {
          setModalOpen(false);
        }, 3000);
      }
    } catch (err) {
      try {
        const ghRes = await fetch('https://api.github.com/repos/ManuelCarrasco28/App-MC-Music/releases/latest');
        if (ghRes.ok) {
          const ghData = await ghRes.json();
          const latestTag = ghData.tag_name || ghData.name || '';
          const latestVersion = latestTag.replace(/^v/i, '').trim();
          if (latestVersion && latestVersion !== '1.0.0') {
            setManualResult({
              type: 'update',
              version: latestVersion,
              url: ghData.html_url || 'https://github.com/ManuelCarrasco28/App-MC-Music/releases'
            });
            return;
          }
        }
      } catch {}

      setManualResult({
        type: 'latest',
        version: '1.0.0'
      });
      setTimeout(() => {
        setModalOpen(false);
      }, 3000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const hasUpdate = updateInfo?.updateAvailable || manualResult?.type === 'update';

  return (
    <header className="app-header glass-panel" style={{ position: 'relative' }}>
      {/* 1. MARCA LOGO Y NOMBRE CON VERSIÓN v1.0.0 */}
      <motion.div
        className="brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', whiteSpace: 'nowrap' }}
      >
        <div
          className="brand-icon"
          style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            width: '32px',
            height: '32px',
            overflow: 'hidden',
            borderRadius: '6px',
            flexShrink: 0
          }}
        >
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.1 }}>
          <span className="brand-title" style={{ fontSize: '1.2rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
            MC-Music
          </span>
          <span style={{ fontSize: '0.72rem', color: '#00f2fe', fontWeight: 700, letterSpacing: '0.4px' }}>
            v1.0.0
          </span>
        </div>
      </motion.div>

      {/* 2. NAVEGACIÓN PRINCIPAL (SOLO LAS 2 PESTAÑAS PRINCIPALES) */}
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
        </nav>
      )}

      {/* 3. LADO DERECHO: PÍLDORA DE ESTADO E ÍCONO INTEGRADO ELEGANTEMENTE */}
      <motion.div
        className={`server-status ${serverStatus}`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        title="Haz clic para comprobar actualizaciones"
        onClick={handleCheckUpdateClick}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          padding: '0.4rem 0.9rem',
          background: hasUpdate ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.04)',
          borderColor: hasUpdate ? 'rgba(16, 185, 129, 0.5)' : undefined
        }}
      >
        <span className="status-dot" style={{ backgroundColor: hasUpdate ? '#10b981' : undefined }} />
        <span style={{ color: hasUpdate ? '#10b981' : undefined, fontWeight: hasUpdate ? 700 : undefined }}>
          {hasUpdate ? `¡v${updateInfo?.latestVersion || manualResult?.version} disponible!` : statusLabel}
        </span>

        <RefreshCw
          size={13}
          className={isCheckingUpdate ? 'spin' : ''}
          style={{ color: hasUpdate ? '#10b981' : 'var(--text-muted)', marginLeft: '2px' }}
        />

        {hasUpdate && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }}
          />
        )}
      </motion.div>

      {/* NOTIFICACIÓN / TOAST FLOTANTE ALINEADO AL ÍCONO */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: '1.4rem',
              zIndex: 9999,
              minWidth: '280px',
              maxWidth: '340px',
              padding: '0.85rem 1.1rem',
              borderRadius: '14px',
              background: 'rgba(14, 19, 31, 0.96)',
              border: '1px solid rgba(0, 242, 254, 0.25)',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(16px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={15} color="#00f2fe" />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>Actualizaciones</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalOpen(false);
                }}
                style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                title="Cerrar"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ marginTop: '0.6rem' }}>
              {isCheckingUpdate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                  <RefreshCw size={14} className="spin" />
                  <span>Buscando la versión más reciente...</span>
                </div>
              ) : manualResult?.type === 'update' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                    ✨ ¡Nueva versión v{manualResult.version} disponible!
                  </span>
                  <a
                    href={manualResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem 0.9rem',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #10b981, #00f2fe)',
                      color: '#090b10',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      textDecoration: 'none'
                    }}
                  >
                    <span>Descargar v{manualResult.version}</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              ) : manualResult?.type === 'latest' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.83rem' }}>
                  <CheckCircle2 size={16} />
                  <span>Tu aplicación está en la versión más reciente (v{manualResult.version}).</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff758f', fontSize: '0.83rem' }}>
                  <AlertCircle size={16} />
                  <span>{manualResult?.text || 'No se pudo verificar la actualización.'}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
