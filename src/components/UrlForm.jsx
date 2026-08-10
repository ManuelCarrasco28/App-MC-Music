import React from 'react';
import { motion } from 'framer-motion';
import { Youtube, Search, Clipboard, Loader2 } from 'lucide-react';

export default function UrlForm({ url, setUrl, onSubmit, isLoading }) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
      }
    } catch (err) {
      console.warn('No se pudo acceder al portapapeles:', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <motion.form 
      onSubmit={handleSubmit} 
      className="url-form-card glass-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
    >
      <div className="input-wrapper">
        <Youtube className="input-icon" size={18} />
        <input
          type="text"
          className="url-input"
          placeholder="Pega el enlace de YouTube aquí..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
        />
        <div className="input-actions">
          <motion.button
            type="button"
            className="btn-icon-action"
            onClick={handlePaste}
            disabled={isLoading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Pegar desde el portapapeles"
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem' }}
          >
            <Clipboard size={13} />
            <span>Pegar</span>
          </motion.button>
        </div>
      </div>

      <motion.button
        type="submit"
        className="btn-primary"
        disabled={isLoading || !url.trim()}
        whileHover={{ scale: isLoading || !url.trim() ? 1 : 1.015 }}
        whileTap={{ scale: isLoading || !url.trim() ? 1 : 0.985 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {isLoading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Loader2 size={18} />
            </motion.div>
            <span>Analizando y extrayendo...</span>
          </>
        ) : (
          <>
            <Search size={18} />
            <span>Buscar y Procesar Enlace</span>
          </>
        )}
      </motion.button>
    </motion.form>
  );
}
