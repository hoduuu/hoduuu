export interface StickyNote {
  id: string;
  content: string;
  color: string;
  tags: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontSize: number;
  alwaysOnTop: boolean;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  listFontSize: number;
}

export interface NotesAPI {
  getAll: () => Promise<StickyNote[]>;
  create: (partial?: Partial<StickyNote>) => Promise<StickyNote | null>;
  update: (id: string, changes: Partial<StickyNote>) => Promise<StickyNote | null>;
  remove: (id: string) => Promise<boolean | null>;
  openNoteWindow: (id: string) => Promise<void>;
  openListWindow: () => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (changes: Partial<AppSettings>) => Promise<AppSettings | null>;
  onNotesChanged: (callback: (notes: StickyNote[]) => void) => () => void;
  onSaveError: (callback: (message: string) => void) => () => void;
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
}

export const IPC_CHANNELS = {
  GET_ALL: 'notes:getAll',
  CREATE: 'notes:create',
  UPDATE: 'notes:update',
  DELETE: 'notes:delete',
  OPEN_WINDOW: 'notes:openWindow',
  OPEN_LIST: 'notes:openList',
  CLOSE_WINDOW: 'notes:closeWindow',
  CHANGED: 'notes:changed',
  SAVE_ERROR: 'notes:saveError',
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',
} as const;

declare global {
  interface Window {
    notesAPI: NotesAPI;
    noteId: string | null;
  }
}
