let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("attendance", 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      const w = d.createObjectStore("workers", { keyPath: "id", autoIncrement: true });
      w.createIndex("cardCode", "cardCode", { unique: true });
      const a = d.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
      a.createIndex("date", "date");
      a.createIndex("workerId", "workerId");
      d.createObjectStore("log", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && r.result);
    t.onabort = () => reject(t.error);
  });
}

const DB = {
  addWorker(name, cardCode) {
    return tx("workers", "readwrite", s =>
      s.add({ name, cardCode, active: true, createdAt: new Date().toISOString() }));
  },
  allWorkers() {
    return tx("workers", "readonly", s => s.getAll());
  },
  addLog(action, details) {
    return tx("log", "readwrite", s =>
      s.add({ time: new Date().toISOString(), action, details }));
  }
};
