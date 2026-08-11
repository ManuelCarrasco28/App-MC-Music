import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoFormatSelector } from '../services/downloader.js';

test('el selector exige la resolucion exacta solicitada', () => {
  const selector = buildVideoFormatSelector('1080');
  assert.match(selector, /bestvideo\[height=1080\]/);
  assert.doesNotMatch(selector, /height<=1080/);
});

test('un video vertical 1080x1920 conserva sus dimensiones reales', () => {
  const selector = buildVideoFormatSelector('1080', { width: 1080, height: 1920 });
  assert.match(selector, /bestvideo\[width=1080\]\[height=1920\]/);
  assert.doesNotMatch(selector, /height=1080/);
});

test('el selector rechaza resoluciones manipuladas o fuera de rango', () => {
  assert.throws(() => buildVideoFormatSelector('FULL HD 1080p'), /no es valida/);
  assert.throws(() => buildVideoFormatSelector('99999'), /no es valida/);
});
