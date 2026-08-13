import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import UrlForm from './components/UrlForm';
import VideoCard from './components/VideoCard';
import FormatSelector from './components/FormatSelector';
import DownloadProgress from './components/DownloadProgress';
import HistoryList from './components/HistoryList';
import SettingsSection from './components/SettingsSection';
import { AlertCircle, Music2, ShieldCheck, Zap, HardDrive, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { getMobileApiOrigin, mobileGetVideoInfo, mobileProcessDownload } from './utils/mobileExtractor';

let youtubeIframeApiPromise;

function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    const timeoutId = window.setTimeout(() => reject(new Error('YouTube Player API no respondió.')), 12000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      if (typeof previousReadyHandler === 'function') previousReadyHandler();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('No se pudo cargar YouTube Player API.'));
      document.head.appendChild(script);
    }
  });

  return youtubeIframeApiPromise;
}

function formatVideoDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

async function getBrowserVideoDuration(videoId) {
  const YT = await loadYoutubeIframeApi();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  document.body.appendChild(container);

  return new Promise((resolve) => {
    let player;
    const timeoutId = window.setTimeout(() => finish(0), 12000);
    const finish = (duration) => {
      window.clearTimeout(timeoutId);
      try { player?.destroy(); } catch {}
      container.remove();
      resolve(Math.floor(Number(duration) || 0));
    };

    player = new YT.Player(container, {
      width: 1,
      height: 1,
      videoId,
      playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
      events: {
        onReady: (event) => finish(event.target.getDuration()),
        onError: () => finish(0)
      }
    });
  });
}

function buildApiUrl(pathname, isNativeMobile) {
  return isNativeMobile ? `${getMobileApiOrigin()}${pathname}` : pathname;
}

async function readErrorResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return payload?.error || fallbackMessage;
  }
  return fallbackMessage;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('downloader'); // 'downloader' | 'settings'
  const isNativeMobile = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState(null);

  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('320');
  const [resolution, setResolution] = useState('720');

  const [isDownloading, setIsDownloading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('preparing');
  const [lastSavedPath, setLastSavedPath] = useState('');
  const [serverStatus, setServerStatus] = useState('checking');
  const downloadAbortControllerRef = useRef(null);
  const activeDownloadJobIdRef = useRef('');
  const progressSourceRef = useRef(null);
  const infoAbortControllerRef = useRef(null);
  const infoRequestIdRef = useRef(0);

  // Rutas separadas para MP3 y MP4
  const [mp3FolderPath, setMp3FolderPath] = useState(() => {
    const saved = localStorage.getItem('mc_music_mp3_folder');
    return saved ? saved.trim() : '';
  });

  const [mp4FolderPath, setMp4FolderPath] = useState(() => {
    const saved = localStorage.getItem('mc_music_mp4_folder');
    return saved ? saved.trim() : '';
  });

  // Determinar si el usuario ya configuró AL MENOS UNA carpeta en su PC (MP3 o MP4)
  const hasConfiguredFolders = Boolean(
    !isNativeMobile && (
      (mp3FolderPath && mp3FolderPath.trim()) ||
      (mp4FolderPath && mp4FolderPath.trim())
    )
  );

  // Activador de Modo de Descarga (disponible en PC y Laptops)
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

  const saveDesktopSettings = (updatedFields) => {
    if (isNativeMobile) return;
    fetch('/api/settings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields)
    }).catch((err) => console.warn('[App] Error guardando ajustes en disco:', err.message));
  };

  useEffect(() => {
    if (isNativeMobile) return;
    fetch('/api/settings/load')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.config) {
          const { mp3FolderPath: mp3, mp4FolderPath: mp4, saveToPCSwitch: sw, history: hist } = data.config;
          if (typeof mp3 === 'string' && mp3) setMp3FolderPath(mp3);
          if (typeof mp4 === 'string' && mp4) setMp4FolderPath(mp4);
          if (typeof sw === 'boolean') setSaveToPCSwitch(sw);
          if (Array.isArray(hist) && hist.length > 0) setHistory(hist);
        }
      })
      .catch((err) => console.warn('[App] No se pudo cargar configuración de disco:', err.message));
  }, [isNativeMobile]);

  useEffect(() => {
    localStorage.setItem('mc_music_save_to_pc_switch', saveToPCSwitch);
    saveDesktopSettings({ saveToPCSwitch });
  }, [saveToPCSwitch]);

  useEffect(() => {
    if (mp3FolderPath) {
      localStorage.setItem('mc_music_mp3_folder', mp3FolderPath);
    } else {
      localStorage.removeItem('mc_music_mp3_folder');
    }
    saveDesktopSettings({ mp3FolderPath });
  }, [mp3FolderPath]);

  useEffect(() => {
    if (mp4FolderPath) {
      localStorage.setItem('mc_music_mp4_folder', mp4FolderPath);
    } else {
      localStorage.removeItem('mc_music_mp4_folder');
    }
    saveDesktopSettings({ mp4FolderPath });
  }, [mp4FolderPath]);

  useEffect(() => {
    try {
      localStorage.setItem('mc_music_history', JSON.stringify(history));
    } catch (err) {
      console.warn('Error guardando historial:', err);
    }
    saveDesktopSettings({ history });
  }, [history]);

  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    if (isNativeMobile) return;
    fetch('/api/update/check')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.updateAvailable) {
          setUpdateInfo(data);
        }
      })
      .catch((err) => console.warn('[App] Error comprobando actualizaciones:', err.message));
  }, [isNativeMobile]);

  useEffect(() => {
    if (isNativeMobile) {
      setServerStatus('online');
      return;
    }

    let disposed = false;
    let activeController = null;
    let healthRequestId = 0;

    const checkService = async (showChecking = false) => {
      const requestId = ++healthRequestId;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      if (showChecking) setServerStatus('checking');
      const timeoutTimer = globalThis.setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch(buildApiUrl('/api/health', false), {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!disposed && requestId === healthRequestId) setServerStatus('online');
      } catch {
        if (!disposed && requestId === healthRequestId) setServerStatus('offline');
      } finally {
        globalThis.clearTimeout(timeoutTimer);
      }
    };

    checkService(true);
    const intervalId = globalThis.setInterval(() => checkService(false), 60_000);
    return () => {
      disposed = true;
      globalThis.clearInterval(intervalId);
      activeController?.abort();
    };
  }, [isNativeMobile]);

  useEffect(() => () => {
    infoAbortControllerRef.current?.abort();
    downloadAbortControllerRef.current?.abort();
    progressSourceRef.current?.close();
  }, []);

  const handleFetchInfo = async (inputUrl) => {
    infoAbortControllerRef.current?.abort();
    const requestController = new AbortController();
    const requestId = ++infoRequestIdRef.current;
    infoAbortControllerRef.current = requestController;

    setError(null);
    setLoadingInfo(true);
    setVideoInfo(null);
    setIsCompleted(false);

    try {
      let data;
      if (isNativeMobile) {
        setServerStatus((current) => current === 'online' ? current : 'waking');
        data = await mobileGetVideoInfo(inputUrl, { signal: requestController.signal });
      } else {
        const response = await fetch(buildApiUrl('/api/info', false), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: inputUrl }),
          signal: requestController.signal
        });
        if (!response.ok) {
          throw new Error(await readErrorResponse(response, 'No se pudo analizar el enlace.'));
        }
        data = await response.json();
      }

      if (requestId !== infoRequestIdRef.current) return;
      setServerStatus('online');
      setVideoInfo(data);

      // Seleccionar automáticamente la resolución recomendada según la pantalla de la PC/Laptop
      const availableHeights = Array.isArray(data.videoResolutions)
        ? data.videoResolutions
          .map((v) => Number(String(v?.height ?? v?.id ?? v).match(/\d{3,4}/)?.[0]))
          .filter((h) => Number.isFinite(h) && h > 0)
        : [];

      if (availableHeights.length > 0) {
        const screenHeight = window.screen?.height || 1080;
        const screenWidth = window.screen?.width || 1920;
        const targetDim = Math.min(screenHeight, screenWidth);

        let recommended = availableHeights.find((h) => h === 1080)
          || availableHeights.find((h) => h === 720)
          || availableHeights.find((h) => h <= targetDim)
          || availableHeights[0];

        setResolution(String(recommended));
      } else {
        setResolution('best');
      }

      if (Array.isArray(data.audioQualities) && data.audioQualities.length > 0) {
        const normalizedQualities = data.audioQualities.map(String);
        setQuality(normalizedQualities.includes('320') ? '320' : normalizedQualities[0]);
      }

      if (data.platform === 'youtube' && !data.duration && data.id) {
        getBrowserVideoDuration(data.id)
          .then((duration) => {
            if (!duration || requestId !== infoRequestIdRef.current) return;
            setVideoInfo((current) => current?.id === data.id
              ? { ...current, duration, durationFormatted: formatVideoDuration(duration) }
              : current);
          })
          .catch((durationError) => console.warn('No se pudo calcular la duración:', durationError.message));
      }
    } catch (err) {
      if (requestId !== infoRequestIdRef.current || err.name === 'AbortError') return;
      setError(err.message || 'No se pudo conectar con el servicio de descarga.');
    } finally {
      if (requestId === infoRequestIdRef.current) {
        setLoadingInfo(false);
        infoAbortControllerRef.current = null;
      }
    }
  };

  const handleStartDownload = async () => {
    if (!videoInfo) return;

    setIsDownloading(true);
    setIsCompleted(false);
    setDownloadProgress(0);
    setDownloadStage('preparing');
    setError(null);
    setLastSavedPath('');

    const selectedFolderPath = format === 'mp3' ? mp3FolderPath : mp4FolderPath;
    const isDirectSaveToPC = !isNativeMobile && hasConfiguredFolders && saveToPCSwitch;
    const downloadController = new AbortController();
    downloadAbortControllerRef.current = downloadController;

    if (isNativeMobile) {
      try {
        const result = await mobileProcessDownload({
          videoInfo,
          format,
          quality,
          resolution,
          signal: downloadController.signal,
          onProgress: (progress) => {
            const val = Number(progress);
            if (val === -1) {
              setDownloadProgress(-1);
            } else {
              setDownloadProgress(Math.min(100, Math.max(0, val || 0)));
            }
          },
          onStage: setDownloadStage
        });
        setIsDownloading(false);
        setIsCompleted(true);
        setDownloadProgress(100);
        setLastSavedPath(result?.savedPathDisplay || 'Descargas del teléfono');

        const newHistoryItem = {
          title: videoInfo.title,
          author: videoInfo.author,
          url: videoInfo.url,
          format: format.toUpperCase(),
          quality: format === 'mp3' ? `${quality} kbps` : resolution === 'best' ? 'Original' : `${resolution}p`,
          savedToPath: 'Descargas del teléfono',
          date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };
        setHistory((prev) => [newHistoryItem, ...prev.filter(h => h.url !== videoInfo.url)].slice(0, 8));
        return;
      } catch (mobileError) {
        setIsDownloading(false);
        setIsCompleted(false);
        setError(mobileError.name === 'AbortError'
          ? 'Descarga cancelada.'
          : (mobileError.message || 'No se pudo completar la descarga móvil.'));
      } finally {
        if (downloadAbortControllerRef.current === downloadController) {
          downloadAbortControllerRef.current = null;
        }
      }
      return;
    }

    const jobId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    activeDownloadJobIdRef.current = jobId;
    const downloadParams = new URLSearchParams({
      url: videoInfo.url,
      format,
      quality: format === 'mp3' ? quality : '',
      resolution: format === 'mp4' ? resolution : '',
      jobId
    });

    if (isDirectSaveToPC && selectedFolderPath && selectedFolderPath.trim()) {
      downloadParams.append('customPath', selectedFolderPath.trim());
      downloadParams.append('directSaveOnly', 'true');
    }

    const downloadUrl = `/api/download?${downloadParams.toString()}`;
    const progressSource = new EventSource(`/api/progress/${encodeURIComponent(jobId)}`);
    progressSourceRef.current = progressSource;
    progressSource.onmessage = (event) => {
      try {
        const progressEvent = JSON.parse(event.data);
        if (progressEvent.stage) setDownloadStage(progressEvent.stage);
        if (progressEvent.error) setError(progressEvent.error);
        if (Number.isFinite(Number(progressEvent.progress))) {
          const val = Number(progressEvent.progress);
          if (val === -1) {
            setDownloadProgress(-1);
          } else {
            setDownloadProgress(Math.min(100, Math.max(0, val)));
          }
        }
      } catch (progressError) {
        console.warn('No se pudo interpretar el progreso:', progressError.message);
      }
    };

    try {
      if (isDirectSaveToPC) {
        // Modo Guardar en mi PC (PC / Laptops)
        const res = await fetch(downloadUrl, { signal: downloadController.signal });
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
        setDownloadProgress(100);
        setIsDownloading(false);
        setIsCompleted(true);

        const newHistoryItem = {
          title: videoInfo.title,
          author: videoInfo.author,
          url: videoInfo.url,
          format: format.toUpperCase(),
          quality: format === 'mp3' ? `${quality} kbps` : resolution === 'best' ? 'Original' : `${resolution}p`,
          savedToPath: savedPathResult,
          date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };

        setHistory((prev) => [newHistoryItem, ...prev.filter(h => h.url !== videoInfo.url)].slice(0, 8));
      } else {
        // Modo Descarga Normal (PC, Laptops o Teléfonos Móviles)
        const res = await fetch(downloadUrl, { signal: downloadController.signal });

        if (!res.ok) throw new Error(await readErrorResponse(res, 'Error al procesar la conversión del contenido.'));

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
        setDownloadProgress(100);
        setIsDownloading(false);
        setIsCompleted(true);

        const newHistoryItem = {
          title: videoInfo.title,
          author: videoInfo.author,
          url: videoInfo.url,
          format: format.toUpperCase(),
          quality: format === 'mp3' ? `${quality} kbps` : resolution === 'best' ? 'Original' : `${resolution}p`,
          savedToPath: 'Descarga del navegador',
          date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };

        setHistory((prev) => [newHistoryItem, ...prev.filter(h => h.url !== videoInfo.url)].slice(0, 8));
      }

    } catch (err) {
      console.error('Error al solicitar la descarga:', err);
      setError(err.name === 'AbortError'
        ? 'Descarga cancelada.'
        : (err.message || 'No se pudo iniciar la descarga. Inténtalo de nuevo.'));
      setIsDownloading(false);
    } finally {
      progressSource.close();
      if (progressSourceRef.current === progressSource) progressSourceRef.current = null;
      if (downloadAbortControllerRef.current === downloadController) {
        downloadAbortControllerRef.current = null;
        activeDownloadJobIdRef.current = '';
      }
    }
  };

  const handleCancelDownload = () => {
    if (!isDownloading) return;
    const activeJobId = activeDownloadJobIdRef.current;
    if (activeJobId) {
      fetch(buildApiUrl(`/api/download/cancel/${encodeURIComponent(activeJobId)}`, isNativeMobile), { method: 'POST' })
        .catch((cancelError) => console.warn('No se pudo notificar la cancelación:', cancelError.message));
    }
    progressSourceRef.current?.close();
    progressSourceRef.current = null;
    downloadAbortControllerRef.current?.abort();
    downloadAbortControllerRef.current = null;
    activeDownloadJobIdRef.current = '';
    setIsDownloading(false);
    setIsCompleted(false);
    setDownloadProgress(0);
    setDownloadStage('preparing');
    setError('Descarga cancelada.');
  };

  const handleReset = () => {
    infoAbortControllerRef.current?.abort();
    infoRequestIdRef.current += 1;
    setLoadingInfo(false);
    setVideoInfo(null);
    setUrl('');
    setIsCompleted(false);
    setDownloadProgress(0);
    setDownloadStage('preparing');
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
        showDesktopSettings={!isNativeMobile}
        serverStatus={serverStatus}
        isNativeMobile={isNativeMobile}
        updateInfo={updateInfo}
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
                {isNativeMobile
                  ? "Descarga MP3 o MP4 con la mejor calidad disponible en el contenido original de YouTube, TikTok y Facebook."
                  : "Descarga MP3 o MP4 con la mejor calidad disponible en el contenido original de YouTube, TikTok, Instagram y Facebook."}
              </p>

              {/* MOSTRAR SELECTOR DE MODO EN ESCRITORIO (PC/LAPTOPS) CUANDO EL USUARIO CONFIGURÓ AMBAS CARPETAS */}
              {!isNativeMobile && hasConfiguredFolders && (
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
              onClear={handleReset}
              isLoading={loadingInfo}
              isBusy={isDownloading}
              isNativeMobile={isNativeMobile}
            />

            {error && (
              <div className="error-banner" role="alert">
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
                quality={quality}
                resolution={resolution}
                progress={downloadProgress}
                stage={downloadStage}
                title={videoInfo?.title || ''}
                savedToPath={lastSavedPath}
                isDirectSave={!isNativeMobile && hasConfiguredFolders && saveToPCSwitch}
                isNativeMobile={isNativeMobile}
                onCancel={handleCancelDownload}
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
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Conversión confiable</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Procesamiento compatible con enlaces públicos de cuatro plataformas.</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.1rem' }}>
                  <div style={{ color: 'var(--accent-purple)', marginBottom: '0.4rem' }}>
                    <Music2 size={20} />
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>MP3 configurable</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Convierte el audio original al bitrate de salida que selecciones.</p>
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

            {!isNativeMobile && !isDownloading && !loadingInfo && (
              <HistoryList
                history={history}
                onSelectUrl={(selectedUrl) => {
                  setUrl(selectedUrl);
                  handleFetchInfo(selectedUrl);
                }}
                onClearHistory={handleClearHistory}
              />
            )}
          </>
        )}

        {/* APARTADO 2: SECCIÓN DE RUTAS DE PC (DISPONIBLE EN TODAS LAS PC Y LAPTOPS) */}
        {!isNativeMobile && activeTab === 'settings' && (
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
        <p>Manuel Carrasco © {new Date().getFullYear()} • Descargas MP3/MP4 de {isNativeMobile ? "YouTube, TikTok y Facebook" : "YouTube, TikTok, Instagram y Facebook"}</p>
      </footer>
    </div>
  );
}
