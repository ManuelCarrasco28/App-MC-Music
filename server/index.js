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

app.use(cors({
  origin(origin, callback) {
    if (process.env.MC_MUSIC_DESKTOP === 'true') {
      const isDesktopOrigin = !origin || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
      return callback(isDesktopOrigin ? null : new Error('Origen no permitido por CORS'), isDesktopOrigin);
    }
    if (!origin || !process.env.ALLOWED_ORIGIN || origin === process.env.ALLOWED_ORIGIN) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  }
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MC-Music API',
    runtime: process.env.VERCEL ? 'serverless' : 'local',
    timestamp: new Date().toISOString()
  });
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

export function startServer(port = PORT, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, async () => {
      const address = server.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      console.log(`\n🎵 =========================================`);
      console.log(`   Servidor MC-Music activo en puerto ${activePort}`);
      console.log(`   URL API: http://${host === '0.0.0.0' ? 'localhost' : host}:${activePort}/api`);
      console.log(`=========================================\n`);

      try {
        await ensureYtDlpBinary();
      } catch (err) {
        console.warn('[warning] No se pudo descargar yt-dlp automáticamente al iniciar:', err.message);
      }

      resolve(server);
    });

    server.on('error', reject);
  });
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (!process.env.VERCEL && isDirectExecution) {
  startServer().catch((err) => {
    console.error('[server] No se pudo iniciar el servidor:', err);
    process.exitCode = 1;
  });
}

export default app;
