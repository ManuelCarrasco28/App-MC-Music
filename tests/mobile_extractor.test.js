import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUrlValue,
  detectPlatformClient
} from '../src/utils/mobileExtractor.js';

test('cleanUrlValue - elimina barras invertidas de escape en URLs', () => {
  const input = 'https:\\/\\/scontent.cdninstagram.com\\/v\\/t51.2885-15\\/sh0.08\\/e35\\/s640x640\\/test.jpg?_nc_ht=scontent.cdninstagram.com&amp;_nc_cat=101';
  const expected = 'https://scontent.cdninstagram.com/v/t51.2885-15/sh0.08/e35/s640x640/test.jpg?_nc_ht=scontent.cdninstagram.com&_nc_cat=101';
  
  assert.equal(cleanUrlValue(input), expected);
});

test('cleanUrlValue - decodifica entidades HTML básicas', () => {
  const input = 'Título &quot;Increíble&quot; &amp; Divertido &#039;Vídeo&#039;';
  const expected = "Título \"Increíble\" & Divertido 'Vídeo'";
  
  assert.equal(cleanUrlValue(input), expected);
});

test('detectPlatformClient - detecta correctamente las plataformas soportadas', () => {
  assert.equal(detectPlatformClient('https://www.instagram.com/reel/C123456/').platform, 'instagram');
  assert.equal(detectPlatformClient('https://vt.tiktok.com/ZS12345/').platform, 'tiktok');
  assert.equal(detectPlatformClient('https://www.facebook.com/share/v/AbCdEf/').platform, 'facebook');
  assert.equal(detectPlatformClient('https://youtu.be/dQw4w9WgXcQ').platform, 'youtube');
  assert.equal(detectPlatformClient('https://example.com/some-media').platform, 'generic');
});

test('hostname validation en resolución directa - simulación', () => {
  const mockResolveHost = (urlStr) => {
    try {
      const parsedUrl = new URL(urlStr);
      const hostname = parsedUrl.hostname.toLowerCase();
      const isBlockedHost = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com)$/.test(hostname);
      return !isBlockedHost;
    } catch {
      return Boolean(urlStr);
    }
  };

  // Estos no deben ser resueltos directamente (necesitan bypass/transcripción)
  assert.equal(mockResolveHost('https://www.instagram.com/reel/12345/'), false);
  assert.equal(mockResolveHost('https://youtube.com/watch?v=123'), false);
  assert.equal(mockResolveHost('https://tiktok.com/@user/video/123'), false);

  // Estos son servidores de descarga válidos (e.g. Cobalt, TikWM CDN, o nuestro Backend)
  assert.equal(mockResolveHost('https://dog.kittycat.boo/download?url=https%3A%2F%2Finstagram.com'), true);
  assert.equal(mockResolveHost('https://v16-webapp.tiktokcdn.com/media/123'), true);
  assert.equal(mockResolveHost('http://192.168.1.15:5050/api/download?url=https://www.instagram.com/p/123'), true);
});

test('mobileGetVideoInfo - extrae directMp4 de og:video y otros metadatos para Facebook', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="Mi Video de FB" />
            <meta property="og:description" content="Descripción del video" />
            <meta property="og:image" content="https://scontent.xx.fbcdn.net/cover.jpg" />
            <meta property="og:video" content="https://video.fepy1-1.fna.fbcdn.net/v/t39.25308-6/real-video-stream.mp4" />
          </head>
        </html>
      `
    };
  };

  try {
    const { mobileGetVideoInfo } = await import('../src/utils/mobileExtractor.js');
    const result = await mobileGetVideoInfo('https://www.facebook.com/share/v/AbCdEf/');
    
    assert.equal(result.title, 'Descripción del video');
    assert.equal(result.directMp4, 'https://video.fepy1-1.fna.fbcdn.net/v/t39.25308-6/real-video-stream.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mobileGetVideoInfo - extrae directMp4 de browser_native_hd_url en el html para Facebook', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      text: async () => `
        <html>
          <body>
            <script>
              var config = { "browser_native_hd_url": "https:\\/\\/video.fepy1-1.fna.fbcdn.net\\/v\\/t39.25308-6\\/another-video.mp4" };
            </script>
          </body>
        </html>
      `
    };
  };

  try {
    const { mobileGetVideoInfo } = await import('../src/utils/mobileExtractor.js');
    const result = await mobileGetVideoInfo('https://www.facebook.com/share/v/AbCdEf/');
    
    assert.equal(result.directMp4, 'https://video.fepy1-1.fna.fbcdn.net/v/t39.25308-6/another-video.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mobileGetVideoInfo - rechaza URLs de Instagram en dispositivos móviles', async () => {
  const { mobileGetVideoInfo } = await import('../src/utils/mobileExtractor.js');
  await assert.rejects(
    () => mobileGetVideoInfo('https://www.instagram.com/reel/C123456/'),
    /Instagram no está disponible en la versión móvil/
  );
});


