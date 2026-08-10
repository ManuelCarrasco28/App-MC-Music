import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

/**
 * Normaliza y valida si una ruta de carpeta existe o la crea si es válida.
 */
export function validateAndPrepareFolder(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return { valid: false, error: 'Ruta no especificada.' };
  }

  const cleanPath = path.resolve(folderPath.trim());

  try {
    if (!fs.existsSync(cleanPath)) {
      fs.mkdirSync(cleanPath, { recursive: true });
    }
    const stat = fs.statSync(cleanPath);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'La ruta especificada no es una carpeta.' };
    }
    return { valid: true, path: cleanPath };
  } catch (err) {
    return { valid: false, error: `No se pudo acceder a la carpeta: ${err.message}` };
  }
}

/**
 * Despliega la ventana nativa de selección de carpeta de Windows (FolderBrowserDialog)
 * y devuelve la ruta completa exacta independientemente de si la carpeta está vacía.
 */
export function pickFolderDialog() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('El selector nativo está disponible en sistemas Windows.'));
    }

    const psCmd = `powershell -Sta -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $true; $d.Description = 'Selecciona la carpeta de destino para tus descargas'; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"`;

    exec(psCmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        return reject(new Error('Diálogo cancelado o no disponible.'));
      }
      const selected = stdout ? stdout.trim() : '';
      if (selected) {
        resolve(selected);
      } else {
        reject(new Error('Selección de carpeta cancelada.'));
      }
    });
  });
}

/**
 * Abre una carpeta en el Explorador de Archivos de Windows buscando de forma inteligente la ubicación real del usuario.
 */
export function openFolderInExplorer(folderPath, defaultType = 'Music') {
  let targetPath = (folderPath && typeof folderPath === 'string') ? folderPath.trim() : '';
  const userHome = process.env.USERPROFILE || os.homedir() || 'C:\\';

  if (!targetPath) {
    targetPath = path.join(userHome, defaultType === 'Videos' ? 'Videos' : 'Music');
  }

  let absolutePath = path.resolve(targetPath);

  // Búsqueda inteligente en las carpetas personales del usuario si se pasó solo el nombre o ruta relativa
  if (!fs.existsSync(absolutePath)) {
    const candidates = [
      path.join(userHome, 'Downloads', targetPath),
      path.join(userHome, 'Music', targetPath),
      path.join(userHome, 'Videos', targetPath),
      path.join(userHome, 'Desktop', targetPath),
      path.join(userHome, targetPath)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        absolutePath = candidate;
        break;
      }
    }
  }

  // Si después de buscar la carpeta aún no existe, se crea en la ruta absoluta resuelta
  if (!fs.existsSync(absolutePath)) {
    try {
      fs.mkdirSync(absolutePath, { recursive: true });
    } catch (createErr) {
      console.error('[folderHelper] Error creando carpeta:', createErr);
    }
  }

  console.log(`[folderHelper] Desplegando Explorador de Windows en la ruta real: "${absolutePath}"`);

  if (process.platform === 'win32') {
    const psCmd = `powershell -Command "Start-Process explorer.exe -ArgumentList '${absolutePath.replace(/'/g, "''")}'"`;
    exec(psCmd, (err) => {
      if (err) {
        console.warn('[folderHelper] PowerShell error, probando cmd.exe start:', err.message);
        exec(`cmd.exe /c start "" "${absolutePath}"`);
      }
    });
  } else if (process.platform === 'darwin') {
    exec(`open "${absolutePath}"`);
  } else {
    exec(`xdg-open "${absolutePath}"`);
  }
}
