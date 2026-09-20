let db;

function cairoDate(d) {
  return (d || new Date()).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function entryType(e) {
  if (e.data && e.data.type) return e.data.type;
  if (e.action === "تسجيل حضور" && e.data) return "in";
  if (e.action === "تسجيل انصراف" && e.data) return "out";
  return null;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("attendance", 3);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      const t = req.transaction;
      if (e.oldVersion < 1) {
        const w = d.createObjectStore("workers", { keyPath: "id", autoIncrement: true });
        w.createIndex("cardCode", "cardCode", { unique: true });
        const a = d.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
        a.createIndex("date", "date");
        a.createIndex("workerId", "workerId");
        d.createObjectStore("log", { keyPath: "id", autoIncrement: true });
      }
      if (e.oldVersion < 2) {
        t.objectStore("attendance").createIndex("open", "open");
      }
      if (e.oldVersion < 3) {
        const ws = t.objectStore("workers");
        if (ws.indexNames.contains("cardCode")) ws.deleteIndex("cardCode");
        ws.createIndex("cardCode", "cardCode", { unique: false });
      }
    };
    req.onblocked = () => alert("اقفل باقي نوافذ التطبيق المفتوحة ثم افتحه من جديد");
    req.onsuccess = () => {
      db = req.result;
      db.onversionchange = () => db.close();
      resolve();
    };
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
    return new Promise((resolve, reject) => {
      const t = db.transaction("workers", "readwrite");
      const s = t.objectStore("workers");
      let newId;
      const g = s.getAll();
      g.onsuccess = () => {
        if (g.result.some(w => !w.deleted && w.cardCode === cardCode)) {
          const err = new Error("duplicate card");
          err.name = "ConstraintError";
          reject(err);
          t.abort();
          return;
        }
        const a = s.add({ name, cardCode, active: true, createdAt: new Date().toISOString() });
        a.onsuccess = () => { newId = a.result; };
      };
      t.oncomplete = () => resolve(newId);
      t.onabort = () => reject(t.error);
    });
  },
  allWorkers() {
    return tx("workers", "readonly", s => s.getAll());
  },
  setWorkerFields(workerId, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction("workers", "readwrite");
      const s = t.objectStore("workers");
      const g = s.get(workerId);
      let prev;
      g.onsuccess = () => {
        const w = g.result;
        if (!w) return;
        prev = fn(w);
        s.put(w);
      };
      t.oncomplete = () => resolve(prev);
      t.onabort = () => reject(t.error);
    });
  },
  newDay(workerId) {
    return DB.setWorkerFields(workerId, w => {
      const prev = w.newDayAt || null;
      w.newDayAt = new Date().toISOString();
      return prev;
    });
  },
  deleteWorker(workerId) {
    return DB.setWorkerFields(workerId, w => {
      w.deleted = true;
      w.deletedAt = new Date().toISOString();
    });
  },
  addLog(action, details, data) {
    return tx("log", "readwrite", s =>
      s.add({ time: new Date().toISOString(), action, details, data }));
  },
  checkIn(workerId) {
    const now = new Date();
    const rec = {
      workerId,
      date: cairoDate(now),
      checkIn: now.toISOString(),
      checkOut: null,
      open: 1
    };
    return tx("attendance", "readwrite", s => s.add(rec));
  },
  checkOut(recordId) {
    return new Promise((resolve, reject) => {
      const t = db.transaction("attendance", "readwrite");
      const s = t.objectStore("attendance");
      const g = s.get(recordId);
      g.onsuccess = () => {
        const rec = g.result;
        rec.checkOut = new Date().toISOString();
        delete rec.open;
        s.put(rec);
      };
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
    });
  },
  recordsForDate(date) {
    return tx("attendance", "readonly", s => s.index("date").getAll(date));
  },
  openRecords() {
    return tx("attendance", "readonly", s => s.index("open").getAll(1));
  },
  recentLog(limit) {
    return new Promise((resolve, reject) => {
      const out = [];
      const t = db.transaction("log", "readonly");
      const req = t.objectStore("log").openCursor(null, "prev");
      req.onsuccess = () => {
        const c = req.result;
        if (c && out.length < limit) { out.push(c.value); c.continue(); }
      };
      t.oncomplete = () => resolve(out);
      t.onabort = () => reject(t.error);
    });
  },
  undoLast(todayStr) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(["log", "attendance", "workers"], "readwrite");
      const logS = t.objectStore("log");
      const attS = t.objectStore("attendance");
      const wS = t.objectStore("workers");
      let result = null;
      const req = logS.openCursor(null, "prev");
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        const e = c.value;
        if (cairoDate(new Date(e.time)) !== todayStr) return;
        const type = entryType(e);
        if (e.undone || !type) { c.continue(); return; }
        e.undone = true;
        c.update(e);
        if (type === "in") {
          attS.delete(e.data.recordId);
        } else if (type === "out") {
          const g = attS.get(e.data.recordId);
          g.onsuccess = () => {
            const rec = g.result;
            if (rec) { rec.checkOut = null; rec.open = 1; attS.put(rec); }
          };
        } else if (type === "addWorker") {
          wS.delete(e.data.workerId);
        } else if (type === "newDay") {
          const g = wS.get(e.data.workerId);
          g.onsuccess = () => {
            const w = g.result;
            if (w) {
              if (e.data.prev) w.newDayAt = e.data.prev;
              else delete w.newDayAt;
              wS.put(w);
            }
          };
        } else if (type === "deleteWorker") {
          const g = wS.get(e.data.workerId);
          g.onsuccess = () => {
            const w = g.result;
            if (w) { delete w.deleted; delete w.deletedAt; wS.put(w); }
          };
        }
        logS.add({
          time: new Date().toISOString(),
          action: "تراجع",
          details: e.action + " — " + e.details
        });
        result = e;
      };
      t.oncomplete = () => resolve(result);
      t.onabort = () => reject(t.error);
    });
  }
};
