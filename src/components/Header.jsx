import React from 'react';
import { motion } from 'framer-motion';
import { Music, HardDrive, Download } from 'lucide-react';

const STATUS_LABELS = {
  online: 'Servicio activo',
  waking: 'Iniciando servicio…',
  checking: 'Comprobando…',
  offline: 'Servicio sin conexión'
};

export default function Header({ activeTab, setActiveTab, showDesktopSettings, serverStatus = 'checking', isNativeMobile = false }) {
  const statusLabel = isNativeMobile && serverStatus === 'online'
    ? 'App móvil lista'
    : STATUS_LABELS[serverStatus] || STATUS_LABELS.checking;

  return (
    <header className="app-header glass-panel">
      <motion.div
        className="brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="brand-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', overflow: 'hidden', borderRadius: '4px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <span className="brand-title">MC-Music-1.0</span>
      </motion.div>

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
    </header>
  );
}
