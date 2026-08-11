import { detectPlatformClient, mobileGetVideoInfo, mobileProcessDownload } from '../src/utils/mobileExtractor.js';

const testCases = [
  { platform: 'Facebook', url: 'https://www.facebook.com/share/r/1HATGuDMxx/' },
  { platform: 'TikTok', url: 'https://vt.tiktok.com/ZS4vDKbTp/' },
  { platform: 'Instagram', url: 'https://www.instagram.com/reel/Db2-wN9B7Hi/?igsh=MWlreHR2cDQ2cDVnMQ==' },
  { platform: 'YouTube', url: 'https://youtu.be/GQ7CIR8jWhY?si=2NgWJrgVTLFFCp6-' }
];

console.log('=== TEST DE EXTRACTION Y DESCARGA MÓVIL (ANDROID) ===\n');

for (const testCase of testCases) {
  console.log(`==================================================`);
  console.log(`PLATAFORMA: ${testCase.platform}`);
  console.log(`URL INPUT:  ${testCase.url}`);
  
  // 1. Detección de Cliente
  const meta = detectPlatformClient(testCase.url);
  console.log(`[1] Detección de Plataforma: ${meta.platform} (${meta.label})`);

  // 2. Extracción de Metadatos
  let videoInfo = null;
  try {
    videoInfo = await mobileGetVideoInfo(testCase.url);
    console.log(`[2] Metadatos Extrayendo:`);
    console.log(`    - Título:     "${videoInfo.title}"`);
    console.log(`    - Autor:      "${videoInfo.author}"`);
    console.log(`    - Duración:   ${videoInfo.durationFormatted}`);
    console.log(`    - Miniatura:  ${videoInfo.thumbnail ? videoInfo.thumbnail.slice(0, 90) + '...' : 'SIN MINIATURA'}`);
    console.log(`    - Fuente:     ${videoInfo.metadataSource}`);
  } catch (err) {
    console.log(`[2] Metadatos ERROR: ${err.message}`);
  }

  // 3. Proceso Descarga MP4
  if (videoInfo) {
    try {
      const mp4Result = await mobileProcessDownload({
        videoInfo,
        format: 'mp4',
        resolution: '720'
      });
      console.log(`[3] Descarga MP4:  EXITOSA -> ${mp4Result.savedPathDisplay}`);
    } catch (err) {
      console.log(`[3] Descarga MP4:  FALLÓ   -> ${err.message}`);
    }

    // 4. Proceso Descarga MP3
    try {
      const mp3Result = await mobileProcessDownload({
        videoInfo,
        format: 'mp3',
        quality: '320'
      });
      console.log(`[4] Descarga MP3:  EXITOSA -> ${mp3Result.savedPathDisplay}`);
    } catch (err) {
      console.log(`[4] Descarga MP3:  FALLÓ   -> ${err.message}`);
    }
  } else {
    console.log(`[3] Descarga MP4:  CANCELADA (Sin Metadatos)`);
    console.log(`[4] Descarga MP3:  CANCELADA (Sin Metadatos)`);
  }
  
  console.log(`==================================================\n`);
}
