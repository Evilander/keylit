// Local-only audio storage. Metadata lives separately so shelf reads never
// materialize every recording. The v1 migration walks one blob at a time.
const DB = "keylit-memos";
const STORE = "memos";
const META = "metadata";
const metadata = ({ blob, ...row }) => ({ ...row, size: blob?.size || 0 });

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no idb")); return; }
    const req = indexedDB.open(DB, 2);
    let abandoned = false;
    req.onblocked = () => { abandoned = true; reject(new Error("Close other Keylit windows to update memo storage")); };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) {
        const meta = db.createObjectStore(META, { keyPath: "id" });
        const cursor = req.transaction.objectStore(STORE).openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          meta.put(metadata(cursor.result.value));
          cursor.result.continue();
        };
      }
    };
    req.onsuccess = () => {
      if (abandoned) { req.result.close(); return; }
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function transaction(mode, stores, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let out;
      tx.oncomplete = () => resolve(typeof out === "function" ? out() : out?.result);
      tx.onerror = () => reject(tx.error || new Error("Memo transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("Memo transaction aborted"));
      try { out = run(tx); } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}

export const memos = {
  supported: () => typeof indexedDB !== "undefined" && typeof MediaRecorder !== "undefined" && !!globalThis.navigator?.mediaDevices?.getUserMedia,
  async list() {
    try {
      const rows = await transaction("readonly", [META], (tx) => tx.objectStore(META).getAll());
      return (rows || []).sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch { return []; }
  },
  async save({ name, blob, at }) {
    try {
      const suffix = globalThis.crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      const id = `memo-${(at || 0).toString(36)}-${suffix}`;
      const row = { id, name: name || "Memo", at: at || 0, mime: blob.type, blob };
      await transaction("readwrite", [STORE, META], (tx) => {
        tx.objectStore(STORE).add(row);
        tx.objectStore(META).add(metadata(row));
      });
      return id;
    } catch { return null; }
  },
  async blobOf(id) {
    try {
      const row = await transaction("readonly", [STORE], (tx) => tx.objectStore(STORE).get(id));
      return row?.blob || null;
    } catch { return null; }
  },
  async rename(id, name) {
    try {
      await transaction("readwrite", [STORE, META], (tx) => {
        const store = tx.objectStore(STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          if (!req.result) return;
          const row = { ...req.result, name: name || req.result.name };
          store.put(row);
          tx.objectStore(META).put(metadata(row));
        };
      });
      return true;
    } catch { return false; }
  },
  async remove(id) {
    try {
      await transaction("readwrite", [STORE, META], (tx) => {
        tx.objectStore(STORE).delete(id);
        tx.objectStore(META).delete(id);
      });
      return true;
    } catch { return false; }
  },
};
