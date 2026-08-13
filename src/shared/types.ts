export interface StickyNote {
  id: string;
  content: string;
  color: string;
  tags: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  alwaysOnTop: boolean;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NotesAPI {
  getAll: () => Promise<StickyNote[]>;
  create: (partial?: Partial<StickyNote>) => Promise<StickyNote | null>;
  update: (id: string, changes: Partial<StickyNote>) => Promise<StickyNote | null>;
  remove: (id: string) => Promise<boolean | null>;
  openNoteWindow: (id: string) => Promise<void>;
  onNotesChanged: (callback: (notes: StickyNote[]) => void) => () => void;
  onSaveError: (callback: (message: string) => void) => () => void;
}

export const IPC_CHANNELS = {
  GET_ALL: 'notes:getAll',
  CREATE: 'notes:create',
  UPDATE: 'notes:update',
  DELETE: 'notes:delete',
  OPEN_WINDOW: 'notes:openWindow',
  CHANGED: 'notes:changed',
  SAVE_ERROR: 'notes:saveError',
} as const;

declare global {
  interface Window {
    notesAPI: NotesAPI;
    noteId: string | null;
  }
}
