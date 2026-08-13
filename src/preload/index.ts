import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { NotesAPI, StickyNote } from '../shared/types';

const notesAPI: NotesAPI = {
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL),
  create: (partial) => ipcRenderer.invoke(IPC_CHANNELS.CREATE, partial),
  update: (id, changes) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE, id, changes),
  remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.DELETE, id),
  openNoteWindow: (id) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_WINDOW, id),
  onNotesChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, notes: StickyNote[]) => callback(notes);
    ipcRenderer.on(IPC_CHANNELS.CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHANGED, listener);
  },
  onSaveError: (callback) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on(IPC_CHANNELS.SAVE_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SAVE_ERROR, listener);
  },
};

contextBridge.exposeInMainWorld('notesAPI', notesAPI);

function getNoteId(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--note-id='));
  return arg ? arg.slice('--note-id='.length) : null;
}

contextBridge.exposeInMainWorld('noteId', getNoteId());
