import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 360,
    height: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/list.html`);
  } else {
    win.loadFile(join(__dirname, '../renderer/list.html'));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
