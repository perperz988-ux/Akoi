// Local persistence (IndexedDB inside the Android WebView's private app storage).
export interface WorldMeta {
  id: string;
  name: string;
  seedText: string;
  seed: number;
  mode: 'survival' | 'creative';
  created: number;
  lastPlayed: number;
  playTime: number;
  player: any | null;
  state: any | null;
}

const DB_NAME = 'akoi-voxel';
let dbp: Promise<IDBDatabase | null> | null = null;
const mem = { worlds: new Map<string, any>(), chunks: new Map<string, any>() };

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => { console.warn('IndexedDB unavailable, using memory store'); res(null); };
    } catch { res(null); }
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function listWorlds(): Promise<WorldMeta[]> {
  const db = await open();
  const all: WorldMeta[] = db ? await req(db.transaction('worlds').objectStore('worlds').getAll()) : [...mem.worlds.values()];
  return all.sort((a, b) => b.lastPlayed - a.lastPlayed);
}
export async function getWorld(id: string): Promise<WorldMeta | null> {
  const db = await open();
  if (!db) return mem.worlds.get(id) || null;
  return (await req(db.transaction('worlds').objectStore('worlds').get(id))) || null;
}
export async function putWorld(w: WorldMeta) {
  const db = await open();
  if (!db) { mem.worlds.set(w.id, structuredClone(w)); return; }
  await req(db.transaction('worlds', 'readwrite').objectStore('worlds').put(w));
}
export async function deleteWorld(id: string) {
  const db = await open();
  if (!db) { mem.worlds.delete(id); for (const k of [...mem.chunks.keys()]) if (k.startsWith(id + ':')) mem.chunks.delete(k); return; }
  const tx = db.transaction(['worlds', 'chunks'], 'readwrite');
  tx.objectStore('worlds').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id + ':', id + ':￿'));
  await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; });
}
export async function listChunkKeys(id: string): Promise<Set<string>> {
  const db = await open();
  const out = new Set<string>();
  if (!db) { for (const k of mem.chunks.keys()) if (k.startsWith(id + ':')) out.add(k.slice(id.length + 1)); return out; }
  const keys = await req(db.transaction('chunks').objectStore('chunks').getAllKeys(IDBKeyRange.bound(id + ':', id + ':￿')));
  for (const k of keys) out.add(String(k).slice(id.length + 1));
  return out;
}
export async function loadChunk(id: string, key: string): Promise<any | null> {
  const db = await open();
  if (!db) return mem.chunks.get(id + ':' + key) || null;
  return (await req(db.transaction('chunks').objectStore('chunks').get(id + ':' + key))) || null;
}
export async function saveChunks(id: string, items: { key: string; data: any }[]) {
  if (!items.length) return;
  const db = await open();
  if (!db) { for (const it of items) mem.chunks.set(id + ':' + it.key, it.data); return; }
  const tx = db.transaction('chunks', 'readwrite');
  const st = tx.objectStore('chunks');
  for (const it of items) st.put(it.data, id + ':' + it.key);
  await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

// ---- simple run-length compression for chunk arrays ----
export function rleEncode(a: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length * 2 + 2);
  let o = 0, i = 0;
  while (i < a.length) {
    const v = a[i]; let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 255) n++;
    out[o++] = n; out[o++] = v; i += n;
  }
  return out.slice(0, o);
}
export function rleDecode(a: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i + 1 < a.length; i += 2) { out.fill(a[i + 1], o, o + a[i]); o += a[i]; }
  return out;
}
