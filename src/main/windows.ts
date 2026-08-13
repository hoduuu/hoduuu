import { BrowserWindow, Tray, Menu, app, nativeImage } from 'electron';
import { join } from 'node:path';
import zlib from 'node:zlib';
import type { NoteStore } from './store';
import { IPC_CHANNELS } from '../shared/types';
import type { StickyNote } from '../shared/types';
import { toReadableErrorMessage } from './ipc';
import { debounce } from '../shared/debounce';

// Runtime-generated tray icon: a small solid-color PNG, built by hand (PNG signature +
// IHDR/IDAT/IEND chunks, deflate-compressed via zlib) so no external image asset needs to be
// sourced. Any visible, non-transparent icon satisfies the requirement — no branding exists.
const TRAY_ICON_PNG = createSolidSquarePng(32, [0xf2, 0x59, 0x4b]);

const noteWindows = new Map<string, BrowserWindow>();
let listWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

export function createListWindow(): BrowserWindow {
  if (listWindow) {
    listWindow.show();
    listWindow.focus();
    return listWindow;
  }
  listWindow = new BrowserWindow({
    width: 360,
    height: 600,
    frame: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  loadRendererPage(listWindow, 'list');
  listWindow.on('closed', () => {
    listWindow = null;
  });
  return listWindow;
}

export function openNoteWindow(store: NoteStore, id: string): void {
  const existing = noteWindows.get(id);
  if (existing) {
    existing.show();
    existing.focus();
    persistNoteUpdate(store, id, { isOpen: true });
    return;
  }
  const note = store.getAllNotes().find((n) => n.id === id);
  if (!note) return;

  const win = new BrowserWindow({
    width: note.size.width,
    height: note.size.height,
    x: note.position.x,
    y: note.position.y,
    alwaysOnTop: note.alwaysOnTop,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--note-id=${id}`],
    },
  });
  loadRendererPage(win, 'note');

  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
    persistNoteUpdate(store, id, { isOpen: false });
  });
  win.on('closed', () => {
    noteWindows.delete(id);
  });

  // `moved`/`resized` are documented (Electron's own type definitions) as darwin/win32-only and
  // never fire on Linux. `move`/`resize` fire on every platform but fire continuously during a
  // drag, so debounce the persistence and read both position and size together via getBounds().
  const persistBounds = debounce(() => {
    // The window may have been destroyed (e.g. its note deleted from the list) while this
    // debounced write was still pending. getBounds() on a destroyed BrowserWindow throws.
    if (win.isDestroyed()) return;
    const { x, y, width, height } = win.getBounds();
    persistNoteUpdate(store, id, { position: { x, y }, size: { width, height } });
  }, 300);
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  noteWindows.set(id, win);
  persistNoteUpdate(store, id, { isOpen: true });
}

export function restoreOpenNoteWindows(store: NoteStore): void {
  for (const note of store.getAllNotes()) {
    if (note.isOpen) openNoteWindow(store, note.id);
  }
}

export function setNoteAlwaysOnTop(id: string, value: boolean): void {
  noteWindows.get(id)?.setAlwaysOnTop(value);
}

export function closeNoteWindow(id: string): void {
  noteWindows.get(id)?.destroy();
}

export function createTray(onOpenList: () => void): void {
  const icon = nativeImage.createFromBuffer(TRAY_ICON_PNG);
  tray = new Tray(icon);
  tray.setToolTip('스티커 메모');
  // Left-click opens the list directly, independent of the context menu, so the tray is never
  // the app's only reachable surface via a single, easy-to-miss interaction.
  tray.on('click', onOpenList);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '메모 목록 열기', click: onOpenList },
      { label: '종료', click: () => app.quit() },
    ]),
  );
  setupApplicationMenu();
}

// Minimal application menu whose sole purpose is guaranteeing a platform-standard quit
// accelerator (Cmd+Q / Alt+F4-equivalent via role:'quit') works even if the tray icon is
// somehow unreachable (e.g. not rendered by the desktop environment). Not a full menu bar.
function setupApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '파일',
        submenu: [{ label: '종료', role: 'quit', accelerator: 'CmdOrCtrl+Q' }],
      },
    ]),
  );
}

// Wraps `store.updateNote` the same way `ipc.ts`'s `withSaveErrorHandling` wraps IPC mutations:
// on failure, compute the same readable message and broadcast `SAVE_ERROR` so the renderer's
// existing dismissible banner shows it, instead of letting the write throw uncaught out of an
// Electron event handler (which would otherwise surface as a raw stack-trace dialog).
function persistNoteUpdate(store: NoteStore, id: string, changes: Partial<StickyNote>): void {
  try {
    store.updateNote(id, changes);
  } catch (error) {
    const message = toReadableErrorMessage(error);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.SAVE_ERROR, `저장 실패: ${message}`);
    }
  }
}

function loadRendererPage(win: BrowserWindow, page: 'list' | 'note'): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`);
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}.html`));
  }
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Builds a minimal, valid, non-transparent solid-color PNG entirely from Buffer/zlib — no
// external image asset is sourced. 8-bit RGB truecolor, no filtering, single IDAT chunk.
function createSolidSquarePng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const rowBytes = size * 3 + 1; // 1 filter-type byte + RGB per pixel
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', ihdrData);
  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}
