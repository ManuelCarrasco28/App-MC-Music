import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Trash2, ArrowUpRight, Music, Video, FolderCheck } from 'lucide-react';

export default function HistoryList({ history, onSelectUrl, onClearHistory }) {
  if (!history || history.length === 0) return null;

  return (
    <motion.div 
      className="history-card glass-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ padding: '1rem' }}
    >
      <div className="history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-cyan)' }}>
          <History size={16} />
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 700 }}>
            Historial Reciente
          </h3>
        </div>

        <motion.button
          type="button"
          className="btn-icon-action"
          onClick={onClearHistory}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          title="Limpiar historial"
        >
          <Trash2 size={12} />
          <span>Limpiar</span>
        </motion.button>
      </div>

      <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <AnimatePresence>
          {history.map((item, index) => (
            <motion.div
              key={`${item.url}-${index}`}
              className="history-item"
              onClick={() => onSelectUrl(item.url)}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
              whileHover={{ scale: 1.01 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
                padding: '0.65rem 0.8rem',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
                <div style={{
                  padding: '0.35rem',
                  borderRadius: '6px',
                  background: item.format === 'MP4' ? 'rgba(121, 40, 202, 0.2)' : 'rgba(0, 242, 254, 0.15)',
                  color: item.format === 'MP4' ? '#c084fc' : 'var(--accent-cyan)',
                  display: 'flex',
                  flexShrink: 0
                }}>
                  {item.format === 'MP4' ? <Video size={14} /> : <Music size={14} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }} title={item.title}>
                    {item.title}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.format}</span>
                    <span>•</span>
                    <span>{item.quality}</span>
                    <span>•</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author}</span>
                  </div>
                </div>
              </div>

              <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <ArrowUpRight size={15} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
