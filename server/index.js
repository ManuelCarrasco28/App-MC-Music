import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidYoutubeUrl } from './utils/validator.js';
import { getVideoInfo, processDownload } from './services/downloader.js';
import { ensureYtDlpBinary } from './utils/ytDlpHelper.js';
import { validateAndPrepareFolder, openFolderInExplorer, pickFolderDialog } from './utils/folderHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MC-Music API', timestamp: new Date().toISOString() });
});

app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !isValidYoutubeUrl(url)) {
      return res.status(400).json({ error: 'Por favor ingresa un enlace válido de YouTube.' });
    }

    const info = await getVideoInfo(url);
    res.json(info);
  } catch (error) {
    console.error('[API /api/info error]:', error.message);
    res.status(500).json({ error: error.message || 'Error al obtener la información del video.' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || !isValidYoutubeUrl(url)) {
      return res.status(400).json({ error: 'La URL proporcionada no es válida.' });
    }

    await processDownload(req, res);
  } catch (error) {
    console.error('[API /api/download error]:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al procesar la descarga.' });
    }
  }
});

app.post('/api/settings/pick-folder', async (req, res) => {
  try {
    const folderPath = await pickFolderDialog();
    res.json({ success: true, folderPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/settings/validate-folder', (req, res) => {
  const { folderPath } = req.body;
  const result = validateAndPrepareFolder(folderPath);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, folderPath: result.path });
});

app.post('/api/settings/open-folder', (req, res) => {
  const { folderPath, defaultType } = req.body;
  try {
    openFolderInExplorer(folderPath, defaultType);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`\n🎵 =========================================`);
    console.log(`   Servidor MC-Music activo en puerto ${PORT}`);
    console.log(`   URL API: http://localhost:${PORT}/api`);
    console.log(`=========================================\n`);

    try {
      await ensureYtDlpBinary();
    } catch (err) {
      console.warn('[warning] No se pudo descargar yt-dlp automáticamente al iniciar:', err.message);
    }
  });
}

export default app;
