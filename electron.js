const { app, BrowserWindow, dialog, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const config = require('./config');
const startServer = require('./server/index');
const APP_USER_MODEL_ID = require('./app-id');

let mainWindow;
let serverInstance;

// ── Windows: AppUserModelID antes de qualquer janela ──
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// ── Guard: avisar se rodando em dev (não empacotado) ──
if (!app.isPackaged && process.platform === 'win32') {
  console.log(
    'AVISO: App rodando em modo desenvolvimento. O ícone fixado na barra de ' +
    'tarefas usará o do Electron. Para testar o ícone real, execute o .exe ' +
    'empacotado em dist/Te Cuida List-win32-x64/Te Cuida List.exe'
  );
}

// ── Caminho do ícone da janela ──
function getWindowIconPath() {
  if (process.platform !== 'win32') return undefined;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, 'build', 'icon.ico');
}

// ── Overlay de badge na taskbar (estilo WhatsApp) ──
function setTaskbarBadge(count) {
  if (process.platform !== 'win32' || !mainWindow) return;

  if (count > 0) {
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4, 0);
    const r = 6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2 + 0.5;
        const dy = y - size / 2 + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const off = (y * size + x) * 4;
        if (dist <= r) {
          canvas[off] = 0x45;     // B
          canvas[off+1] = 0x60;   // G
          canvas[off+2] = 0xe9;   // R
          canvas[off+3] = 250;    // A
        } else {
          canvas[off+3] = 0;
        }
      }
    }
    const img = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    mainWindow.setOverlayIcon(img, count + ' pendente' + (count > 1 ? 's' : ''));
  } else {
    mainWindow.setOverlayIcon(null, '');
  }
}

app.whenReady().then(async () => {
  const userDataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  config.dataDir = userDataDir;

  console.log('Diretório de dados:', userDataDir);

  const inUse = await isPortInUse(config.port);
  if (inUse) {
    console.log(`Porta ${config.port} ocupada, tentando próxima...`);
  }

  try {
    const { server, port } = await startServer();
    serverInstance = server;

    Menu.setApplicationMenu(null);

    const iconPath = getWindowIconPath();
    const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
    if (process.platform === 'win32') {
      console.log('[icon] path:', iconPath);
      console.log('[icon] empty:', icon ? icon.isEmpty() : true);
      console.log('[icon] size:', icon && !icon.isEmpty() ? JSON.stringify(icon.getSize()) : 'N/A');
    }

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 900,
      minHeight: 600,
      title: 'Te Cuida List - Gerenciador de Tarefas',
      icon: icon && !icon.isEmpty() ? icon : iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    mainWindow.loadURL(`http://localhost:${port}`);

    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => {
        mainWindow.loadURL(`http://localhost:${port}`);
      }, 1000);
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // IPC: recebe badge count do renderer
    ipcMain.on('set-badge', (_event, count) => setTaskbarBadge(count));

  } catch (err) {
    console.error('Erro ao iniciar servidor:', err);
    dialog.showErrorBox('Erro ao Iniciar', `Não foi possível iniciar o servidor:\n${err.message}`);
    app.quit();
  }
});

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

app.on('window-all-closed', () => {
  if (serverInstance) serverInstance.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) app.emit('ready');
});
