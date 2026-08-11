import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatform,
  extractVideoId,
  isValidMediaUrl,
  normalizeMediaUrl
} from '../utils/validator.js';

test('acepta variantes modernas de las cuatro plataformas', () => {
  const supported = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDtest',
    'https://youtube.com/shorts/dQw4w9WgXcQ?feature=share',
    'https://m.youtube.com/live/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://vm.tiktok.com/ZM1234567/',
    'https://www.tiktok.com/@creator/video/7420000000000000000?is_from_webapp=1',
    'https://www.instagram.com/reel/ABC_def-12/?igsh=test',
    'https://www.instagram.com/share/reel/ABC_def-12/',
    'https://www.facebook.com/reel/123456789012345/',
    'https://www.facebook.com/share/v/AbCdEf123/',
    'https://fb.watch/AbCdEf123/'
  ];

  for (const url of supported) assert.equal(isValidMediaUrl(url), true, url);
});

test('rechaza sitios ajenos, raices y URLs que pueden usarse para SSRF', () => {
  const rejected = [
    'http://127.0.0.1:5050/api/health',
    'http://localhost/internal',
    'https://example.com/video.mp4',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://www.instagram.com/',
    'https://www.tiktok.com/'
  ];

  for (const url of rejected) assert.equal(isValidMediaUrl(url), false, url);
});

test('normaliza YouTube y elimina parametros de rastreo', () => {
  assert.equal(
    normalizeMediaUrl('https://youtu.be/dQw4w9WgXcQ?t=20'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  );
  assert.equal(extractVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(
    normalizeMediaUrl('https://www.instagram.com/reel/ABC123/?igsh=tracking'),
    'https://www.instagram.com/reel/ABC123/'
  );
});

test('Facebook conserva solo los parametros necesarios para identificar el video', () => {
  assert.equal(
    normalizeMediaUrl('https://m.facebook.com/watch/?v=123456&id=99&mibextid=tracking'),
    'https://m.facebook.com/watch/?v=123456&id=99'
  );
  assert.equal(detectPlatform('https://fb.watch/ABC123/').platform, 'facebook');
});
