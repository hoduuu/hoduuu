import { app, BrowserWindow } from 'electron';
import { createNoteStore } from './store';
import { registerIpcHandlers } from './ipc';
import {
  createListWindow,
  openNoteWindow,
  restoreOpenNoteWindows,
  setNoteAlwaysOnTop,
  createTray,
} from './windows';

app.whenReady().then(() => {
  const store = createNoteStore(app.getPath('userData'));

  registerIpcHandlers(store, {
    openNoteWindow: (id) => openNoteWindow(store, id),
    setNoteAlwaysOnTop,
  });

  createTray(() => createListWindow());
  createListWindow();
  restoreOpenNoteWindows(store);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createListWindow();
  });
});

app.on('window-all-closed', () => {
  // 트레이에 상주해야 하므로 창이 모두 닫혀도 앱을 종료하지 않는다.
  // 종료는 트레이 메뉴의 "종료"를 통해서만 이루어진다.
});
