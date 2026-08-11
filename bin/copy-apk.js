#!/usr/bin/env node
/**
 * bin/copy-apk.js
 *
 * Copia el APK compilado a Instaladores/Android_Movil/.
 * Nombra el archivo estrictamente como: MC-Music-1.0.apk
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const type = (process.argv[2] || 'debug').toLowerCase();
if (!['debug', 'release'].includes(type)) {
  console.error(`[copy-apk] Tipo no válido: "${type}". Usa "debug" o "release".`);
  process.exit(1);
}

// Rutas de origen
const apkSrcMap = {
  debug:   path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug',   'app-debug.apk'),
  release: path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
};
const src = apkSrcMap[type];

if (!fs.existsSync(src)) {
  console.error(`[copy-apk] El APK de ${type} no existe: ${src}`);
  console.error(`           Asegúrate de que la compilación terminó correctamente.`);
  process.exit(1);
}

// Carpeta de destino
const destDir = path.join(root, 'Instaladores', 'Android_Movil');
fs.mkdirSync(destDir, { recursive: true });

// Eliminar versiones anteriores con formato 1.0.0 para dejar solo MC-Music-1.0.apk
const oldFile = path.join(destDir, 'MC-Music-1.0.0.apk');
if (fs.existsSync(oldFile)) {
  try { fs.unlinkSync(oldFile); } catch {}
}

const destName = 'MC-Music-1.0.apk';
const dest = path.join(destDir, destName);

fs.copyFileSync(src, dest);
fs.copyFileSync(src, path.join(destDir, 'MC-Music.apk'));

const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ APK copiado correctamente:`);
console.log(`   ${dest}`);
console.log(`   Nombre: MC-Music-1.0.apk (${sizeMB} MB)\n`);
