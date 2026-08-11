#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const logoSource = path.join(root, 'public', 'logo.png');

if (!fs.existsSync(logoSource)) {
  console.error(`❌ No se encontró el archivo de origen: ${logoSource}`);
  process.exit(1);
}

const targets = [
  path.join(root, 'public', 'LOGO.png'),
  path.join(root, 'public', 'icon.png'),
  path.join(root, 'public', 'favicon.png'),
  path.join(root, 'electron', 'icon.png'),

  // Android mipmap densities
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher_round.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher_foreground.png'),

  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher_round.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher_foreground.png'),

  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher_round.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher_foreground.png'),

  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher_round.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher_foreground.png'),

  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_round.png'),
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_foreground.png')
];

let count = 0;
for (const targetPath of targets) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(logoSource, targetPath);
  count++;
}

console.log(`\n✅ Logo original (public/logo.png) sincronizado exitosamente en ${count} ubicaciones de Web, Desktop y Android.\n`);
