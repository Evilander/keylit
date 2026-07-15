// memos.js — the pocket recorder's shelf. Voice memos live in IndexedDB
// (audio blobs don't fit localStorage), keyed newest-first. Everything is
// fail-soft: no IndexedDB, no mic, no MediaRecorder → the Write room simply
// doesn't offer the recorder (prime directive 4). Audio never leaves the
// machine (prime directive 3) — these are yours alone.

const DB = "keylit-memos";
const STORE = "memos";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no idb")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const tx = (db, mode, run) => new Promise((resolve, reject) => {
  const t = db.transaction(STORE, mode);
  const store = t.objectStore(STORE);
  const out = run(store);
  t.oncomplete = () => resolve(out?.result ?? out);
  t.onerror = () => reject(t.error);
});

export const memos = {
  supported: () =>
    typeof indexedDB !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia,

  /** [{ id, name, at, size, mime }] newest first — blobs stay in the store. */
  async list() {
    try {
      const db = await openDb();
      const rows = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      return rows
        .map(({ blob, ...meta }) => ({ ...meta, size: blob?.size || 0 }))
        .sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch { return []; }
  },

  async save({ name, blob, at }) {
    const db = await openDb();
    const id = `memo-${(at || 0).toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    await tx(db, "readwrite", (s) => s.put({ id, name: name || "Memo", at: at || 0, mime: blob.type, blob }));
    return id;
  },

  async blobOf(id) {
    try {
      const db = await openDb();
      const row = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return row?.blob || null;
    } catch { return null; }
  },

  async rename(id, name) {
    try {
      const db = await openDb();
      const row = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!row) return;
      await tx(db, "readwrite", (s) => s.put({ ...row, name: name || row.name }));
    } catch { /* rename is a nicety */ }
  },

  async remove(id) {
    try {
      const db = await openDb();
      await tx(db, "readwrite", (s) => s.delete(id));
    } catch { /* already gone is fine */ }
  },
};
