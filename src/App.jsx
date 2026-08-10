import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import UrlForm from './components/UrlForm';
import VideoCard from './components/VideoCard';
import FormatSelector from './components/FormatSelector';
import DownloadProgress from './components/DownloadProgress';
import HistoryList from './components/HistoryList';
import SettingsSection from './components/SettingsSection';
import { AlertCircle, Music2, ShieldCheck, Zap, HardDrive, Download } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('downloader'); // 'downloader' | 'settings'

  // Detección en tiempo real de móviles o entorno Web Nube (Vercel)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  });

  const [isVercelWeb, setIsVercelWeb] = useState(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host.includes('vercel.app') || (host !== 'localhost' && host !== '127.0.0.1' && host !== '');
  });

  useEffect(() => {
    const handleResize = () => {
      const mobileCheck = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setIsMobile(mobileCheck);
      const host = window.location.hostname;
      const cloudCheck = host.includes('vercel.app') || (host !== 'localhost' && host !== '127.0.0.1' && host !== '');
      setIsVercelWeb(cloudCheck);

      if ((mobileCheck || cloudCheck) && activeTab === 'settings') {
        setActiveTab('downloader');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  // Solo se permite la configuración de carpetas de PC cuando la app se ejecuta localmente en la computadora
  const isDesktopLocalMode = !isMobile && !isVercelWeb;

  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState(null);

  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('320');
  const [resolution, setResolution] = useState('720');

  const [isDownloading, setIsDownloading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState('');

  // Rutas separadas para MP3 y MP4
  const [mp3FolderPath, setMp3FolderPath] = useState(() => {
    const saved = localStorage.getItem('mc_music_mp3_folder');
    if (!saved || saved.includes('Users\\Public')) return '';
    return saved;
  });

  const [mp4FolderPath, setMp4FolderPath] = useState(() => {
    const saved = localStorage.getItem('mc_music_mp4_folder');
    if (!saved || saved.includes('Users\\Public')) return '';
    return saved;
  });

  // Determinar si el usuario ya configuró AMBAS carpetas en su PC (MP3 y MP4)
  const hasConfiguredFolders = Boolean(isDesktopLocalMode && mp3FolderPath && mp3FolderPath.trim() && mp4FolderPath && mp4FolderPath.trim());

  // Activador de Modo de Descarga (solo activo en escritorio local)
  const [saveToPCSwitch, setSaveToPCSwitch] = useState(() => {
    const saved = localStorage.getItem('mc_music_save_to_pc_switch');
    return saved !== null ? saved === 'true' : true;
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('mc_music_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('mc_music_save_to_pc_switch', saveToPCSwitch);
  }, [saveToPCSwitch]);

  useEffect(() => {
    if (mp3FolderPath) {
      localStorage.setItem('mc_music_mp3_folder', mp3FolderPath);
    } else {
      localStorage.removeItem('mc_music_mp3_folder');
    }
  }, [mp3FolderPath]);

  useEffect(() => {
    if (mp4FolderPath) {
      localStorage.setItem('mc_music_mp4_folder', mp4FolderPath);
    } else {
      localStorage.removeItem('mc_music_mp4_folder');
    }
  }, [mp4FolderPath]);

  useEffect(() => {
    try {
      localStorage.setItem('mc_music_history', JSON.stringify(history));
    } catch (err) {
      console.warn('Error guardando historial:', err);
    }
  }, [history]);

  const handleFetchInfo = async (inputUrl) => {
    setError(null);
    setLoadingInfo(true);
    setVideoInfo(null);
    setIsCompleted(false);

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ocurrió un error al procesar el enlace.');
      }

      setVideoInfo(data);
      if (data.videoResolutions && data.videoResolutions.length > 0) {
        setResolution(data.videoResolutions[0]);
      }
    } catch (err) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleStartDownload = async () => {
    if (!videoInfo) return;

    setIsDownloading(true);
    setIsCompleted(false);
    setError(null);
    setLastSavedPath('');

    const selectedFolderPath = format === 'mp3' ? mp3FolderPath : mp4FolderPath;
    const isDirectSaveToPC = isDesktopLocalMode && hasConfiguredFolders && saveToPCSwitch;

    const downloadParams = new URLSearchParams({
      url: videoInfo.url,
      format,
      quality: format === 'mp3' ? quality : '',
      resolution: format === 'mp4' ? resolution : ''
    });

    if (isDirectSaveToPC && selectedFolderPath && selectedFolderPath.trim()) {
      downloadParams.append('customPath', selectedFolderPath.trim());
      downloadParams.append('directSaveOnly', 'true');
    }

    const downloadUrl = `/api/download?${downloadParams.toString()}`;

    try {
      if (isDirectSaveToPC) {
        // Modo Guardar en mi PC (solo escritorio local)
        const res = await fetch(downloadUrl);
        const contentType = res.headers.get('content-type') || '';
        let savedPathResult = selectedFolderPath;

        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Error al guardar el archivo en la PC.');
          }
          if (data.savedToPath) {
            savedPathResult = data.savedToPath;
          }
        } else {
          await res.blob();
        }

        setLastSavedPath(savedPathResult);
        setIsDownloading(false);
        setIsCompleted(true);

        const newHistoryItem = {
          title: videoInfo.title,
          author: videoInfo.author,
          url: videoInfo.url,
          format: format.toUpperCase(),
          quality: format === 'mp3' ? `${quality}kbps` : `${resolution}p`,
          savedToPath: savedPathResult,
          date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };

        setHistory((prev) => [newHistoryItem, ...prev.filter(h => h.url !== videoInfo.url)].slice(0, 8));
      } else {
        // Modo Descarga Web / Navegador (Vercel o Móvil)
        const res = await fetch(downloadUrl);

        if (!res.ok) {
          throw new Error('Error al procesar la conversión del video.');
        }

        const blob = await res.blob();
        const fileExt = format === 'mp4' ? 'mp4' : 'mp3';
        const cleanTitle = (videoInfo.title || 'audio').replace(/[\\/:\*\?"<>\|]/g, '').trim();
        const fileName = `${cleanTitle}.${fileExt}`;

        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        setLastSavedPath('Descarga del navegador');
        setIsDownloading(false);
        setIsCompleted(true);

        const newHistoryItem = {
          title: videoInfo.title,
          author: videoInfo.author,
          url: videoInfo.url,
          format: format.toUpperCase(),
          quality: format === 'mp3' ? `${quality}kbps` : `${resolution}p`,
          savedToPath: 'Descarga del navegador',
          date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };

        setHistory((prev) => [newHistoryItem, ...prev.filter(h => h.url !== videoInfo.url)].slice(0, 8));
      }

    } catch (err) {
      console.error('Error al solicitar la descarga:', err);
      setError(err.message || 'No se pudo iniciar la descarga. Inténtalo de nuevo.');
      setIsDownloading(false);
    }
  };

  const handleReset = () => {
    setVideoInfo(null);
    setUrl('');
    setIsCompleted(false);
    setError(null);
    setLastSavedPath('');
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showDesktopSettings={isDesktopLocalMode}
      />

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {/* APARTADO 1: DESCARGADOR PRINCIPAL */}
        {activeTab === 'downloader' && (
          <>
            <div className="hero-section">
              <h1 className="hero-title">
                Descarga tu música en <span className="gradient-text">MP3 y MP4</span>
              </h1>
              <p className="hero-subtitle">
                Convierte y descarga audio en alta fidelidad 320kbps o videos en HD directamente desde YouTube.
              </p>

              {/* MOSTRAR SELECTOR DE MODO ÚNICAMENTE EN ESCRITORIO LOCAL CUANDO EL USUARIO CONFIGURÓ AMBAS CARPETAS */}
              {isDesktopLocalMode && hasConfiguredFolders && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.8rem', animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={{
                    display: 'inline-flex',
                    background: 'rgba(12, 16, 28, 0.85)',
                    padding: '4px',
                    borderRadius: '30px',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(12px)'
                  }}>
                    <button
                      type="button"
                      onClick={() => setSaveToPCSwitch(false)}
                      style={{
                        padding: '0.45rem 1.2rem',
                        borderRadius: '22px',
                        border: 'none',
                        background: !saveToPCSwitch ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                        color: !saveToPCSwitch ? 'var(--text-main)' : 'var(--text-muted)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        fontFamily: 'var(--font-heading)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.25s ease'
                      }}
                    >
                      <Download size={15} />
                      <span>Descarga Normal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSaveToPCSwitch(true)}
                      style={{
                        padding: '0.45rem 1.2rem',
                        borderRadius: '22px',
                        border: 'none',
                        background: saveToPCSwitch
                          ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))'
                          : 'transparent',
                        color: saveToPCSwitch ? '#ffffff' : 'var(--text-muted)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        fontFamily: 'var(--font-heading)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.25s ease',
                        boxShadow: saveToPCSwitch ? '0 0 15px rgba(0, 242, 254, 0.3)' : 'none'
                      }}
                    >
                      <HardDrive size={15} />
                      <span>Guardar en mi PC</span>
                      {saveToPCSwitch && (
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                          boxShadow: '0 0 6px #10b981'
                        }}></span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <UrlForm
              url={url}
              setUrl={setUrl}
              onSubmit={handleFetchInfo}
              isLoading={loadingInfo}
            />

            {error && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {videoInfo && !isDownloading && !isCompleted && (
              <>
                <VideoCard videoInfo={videoInfo} />
                <FormatSelector
                  videoInfo={videoInfo}
                  format={format}
                  setFormat={setFormat}
                  quality={quality}
                  setQuality={setQuality}
                  resolution={resolution}
                  setResolution={setResolution}
                  onStartDownload={handleStartDownload}
                  isDownloading={isDownloading}
                />
              </>
            )}

            {(isDownloading || isCompleted) && (
              <DownloadProgress
                isDownloading={isDownloading}
                isCompleted={isCompleted}
                format={format}
                title={videoInfo?.title || ''}
                savedToPath={lastSavedPath}
                isDirectSave={isDesktopLocalMode && hasConfiguredFolders && saveToPCSwitch}
                onReset={handleReset}
              />
            )}

            {!videoInfo && !isDownloading && !loadingInfo && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.9rem',
                marginTop: '0.4rem'
              }}>
                <div className="glass-panel" style={{ padding: '1.1rem' }}>
                  <div style={{ color: 'var(--accent-cyan)', marginBottom: '0.4rem' }}>
                    <Zap size={20} />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Conversión Rápida</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Audio en alta fidelidad sin tiempos de espera.</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.1rem' }}>
                  <div style={{ color: 'var(--accent-purple)', marginBottom: '0.4rem' }}>
                    <Music2 size={20} />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Audio HQ 320 kbps</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Extrae audio con carátula e información incrustada.</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.1rem' }}>
                  <div style={{ color: '#10b981', marginBottom: '0.4rem' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Sin Anuncios</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Descargas directas y seguras sin publicidad engañosa.</p>
                </div>
              </div>
            )}

            <HistoryList
              history={history}
              onSelectUrl={(selectedUrl) => {
                setUrl(selectedUrl);
                handleFetchInfo(selectedUrl);
              }}
              onClearHistory={handleClearHistory}
            />
          </>
        )}

        {/* APARTADO 2: SECCIÓN DE RUTAS DE PC (SOLO ESCRITORIO LOCAL) */}
        {isDesktopLocalMode && activeTab === 'settings' && (
          <SettingsSection
            mp3FolderPath={mp3FolderPath}
            setMp3FolderPath={setMp3FolderPath}
            mp4FolderPath={mp4FolderPath}
            setMp4FolderPath={setMp4FolderPath}
            onSwitchToDownloader={() => setActiveTab('downloader')}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>MC-Music © {new Date().getFullYear()} • Descargas directas de YouTube en MP3/MP4</p>
      </footer>
    </div>
  );
}
