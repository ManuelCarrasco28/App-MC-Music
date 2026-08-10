import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';

export default function InfoSkeletonCard() {
  return (
    <motion.div
      className="glass-panel"
      style={{
        padding: '1.5rem',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        gap: '1.4rem',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(0, 242, 254, 0.3)',
        background: 'rgba(15, 20, 35, 0.75)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}
      initial={{ opacity: 0, y: 15, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
    >
      {/* Línea de escaneo láser de neón animada */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, var(--accent-cyan), var(--accent-purple), transparent)',
          boxShadow: '0 0 12px var(--accent-cyan)'
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
      />

      {/* Miniatura Skeleton */}
      <div style={{
        width: '180px',
        height: '100px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(30, 38, 60, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          style={{ color: 'var(--accent-cyan)' }}
        >
          <Loader2 size={28} />
        </motion.div>
      </div>

      {/* Detalles Skeleton */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-cyan)' }}>
          <Sparkles size={16} className="spin-slow" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '0.5px' }}>
            CONECTANDO Y EXTRAYENDO METADATOS DE YOUTUBE...
          </span>
        </div>

        {/* Línea de Título Skeleton */}
        <motion.div
          style={{
            height: '22px',
            width: '80%',
            borderRadius: '6px',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(0, 242, 254, 0.2), rgba(255,255,255,0.06))'
          }}
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />

        {/* Líneas de Autor/Vistas Skeleton */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <motion.div
            style={{
              height: '14px',
              width: '35%',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.08)'
            }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: 0.2, ease: "easeInOut" }}
          />
          <motion.div
            style={{
              height: '14px',
              width: '25%',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.08)'
            }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: 0.4, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
