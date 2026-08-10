import React from 'react';
import { motion } from 'framer-motion';
import { Music, HardDrive, Download } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, showDesktopSettings }) {
  return (
    <header className="app-header glass-panel">
      <motion.div 
        className="brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="brand-icon">
          <Music size={22} />
        </div>
        <div>
          <span className="brand-title">MC-Music</span>
        </div>
      </motion.div>

      {/* Navegación por pestañas: La pestaña 'Carpeta en PC' solo se muestra al ejecutar la app localmente en una PC */}
      {showDesktopSettings && (
        <nav style={{ display: 'flex', gap: '0.4rem', background: 'rgba(10, 14, 26, 0.6)', padding: '4px', borderRadius: '30px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('downloader')}
            style={{
              position: 'relative',
              padding: '0.5rem 1.1rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'downloader' ? '#ffffff' : 'var(--text-muted)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              zIndex: 1,
              transition: 'color 0.2s ease'
            }}
          >
            {activeTab === 'downloader' && (
              <motion.div
                layoutId="header-active-pill"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '25px',
                  background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                  boxShadow: 'var(--shadow-glow)',
                  zIndex: -1
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Download size={15} />
            <span>Descargador Principal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              position: 'relative',
              padding: '0.5rem 1.1rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'settings' ? '#ffffff' : 'var(--text-muted)',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              zIndex: 1,
              transition: 'color 0.2s ease'
            }}
          >
            {activeTab === 'settings' && (
              <motion.div
                layoutId="header-active-pill"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '25px',
                  background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                  boxShadow: 'var(--shadow-glow)',
                  zIndex: -1
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <HardDrive size={15} />
            <span>Carpeta en PC</span>
          </button>
        </nav>
      )}

      {/* Indicador del estado del servidor */}
      <motion.div 
        className="server-status"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <span className="status-dot"></span>
        <span>Servidor activo</span>
      </motion.div>
    </header>
  );
}
