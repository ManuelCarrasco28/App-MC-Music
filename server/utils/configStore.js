import fs from 'fs';
import path from 'path';
import os from 'os';

function getConfigDir() {
  if (process.env.MC_MUSIC_DATA_DIR) {
    return path.resolve(process.env.MC_MUSIC_DATA_DIR);
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'MC-Music');
  }
  return path.join(os.homedir(), '.mc_music');
}

const configDir = getConfigDir();
const configFile = path.join(configDir, 'config.json');

export function loadStoredConfig() {
  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf8');
      const data = JSON.parse(raw);
      return {
        mp3FolderPath: typeof data.mp3FolderPath === 'string' ? data.mp3FolderPath : '',
        mp4FolderPath: typeof data.mp4FolderPath === 'string' ? data.mp4FolderPath : '',
        saveToPCSwitch: typeof data.saveToPCSwitch === 'boolean' ? data.saveToPCSwitch : true,
        history: Array.isArray(data.history) ? data.history : []
      };
    }
  } catch (err) {
    console.warn('[configStore] Error leyendo config.json:', err.message);
  }
  return {
    mp3FolderPath: '',
    mp4FolderPath: '',
    saveToPCSwitch: true,
    history: []
  };
}

export function saveStoredConfig(updates = {}) {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    const current = loadStoredConfig();
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('[configStore] Error guardando config.json en disco:', err.message);
    throw new Error(`No se pudo guardar la configuración en disco: ${err.message}`);
  }
}
