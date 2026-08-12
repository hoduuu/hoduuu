import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { StickyNote } from '../shared/types';
import type { NoteStore } from './store';

interface WindowCallbacks {
  openNoteWindow: (id: string) => void;
  setNoteAlwaysOnTop: (id: string, value: boolean) => void;
}

export function registerIpcHandlers(store: NoteStore, callbacks: WindowCallbacks): void {
  ipcMain.handle(IPC_CHANNELS.GET_ALL, () => store.getAllNotes());

  ipcMain.handle(IPC_CHANNELS.CREATE, (event, partial?: Partial<StickyNote>) =>
    withSaveErrorHandling(event, () => {
      const note = store.createNote(partial);
      broadcastChanged(store);
      return note;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.UPDATE, (event, id: string, changes: Partial<StickyNote>) =>
    withSaveErrorHandling(event, () => {
      const updated = store.updateNote(id, changes);
      if (updated && changes.alwaysOnTop !== undefined) {
        callbacks.setNoteAlwaysOnTop(id, changes.alwaysOnTop);
      }
      broadcastChanged(store);
      return updated;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.DELETE, (event, id: string) =>
    withSaveErrorHandling(event, () => {
      const removed = store.deleteNote(id);
      broadcastChanged(store);
      return removed;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_WINDOW, (_event, id: string) => {
    callbacks.openNoteWindow(id);
  });
}

function withSaveErrorHandling<T>(event: IpcMainInvokeEvent, fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    const message = toReadableErrorMessage(error);
    event.sender.send(IPC_CHANNELS.SAVE_ERROR, `저장 실패: ${message}`);
    return null;
  }
}

// The `atomically` package (a transitive dependency of electron-store) retries certain
// synchronous write failures (EPERM/EACCES/EAGAIN/EBUSY/EMFILE/ENFILE) via unthrottled
// recursion. When the failure is immediate and persistent (e.g. a read-only/immutable
// file), this blows the JS call stack before the retry timeout elapses, surfacing a
// confusing "Maximum call stack size exceeded" RangeError instead of the real cause.
// Translate that specific case into a readable, permission-oriented message; every other
// error still passes its real `.message` through unchanged (e.g. ENOSPC, which is not in
// atomically's retriable list and already surfaces a proper message today).
function toReadableErrorMessage(error: unknown): string {
  if (error instanceof RangeError && error.message.includes('call stack')) {
    return '파일에 쓸 수 없습니다 (권한을 확인해주세요)';
  }
  return error instanceof Error ? error.message : String(error);
}

function broadcastChanged(store: NoteStore): void {
  const notes = store.getAllNotes();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.CHANGED, notes);
  }
}
