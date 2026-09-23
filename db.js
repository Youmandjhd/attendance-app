const SUPABASE_URL = "https://eixxbkfmwwxryuhiqbcf.supabase.co";
const SUPABASE_KEY = "sb_publishable_a3VcVSCAheV4gwMSNEpNOg_tsPfXuwm";

async function sb(path, opts) {
  opts = opts || {};
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: opts.method || "GET",
    body: opts.body,
    headers: Object.assign({
      "apikey": SUPABASE_KEY,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation"
    }, opts.headers || {})
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Supabase error " + res.status + ": " + text);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function cairoDate(d) {
  return (d || new Date()).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function entryType(e) {
  return (e.data && e.data.type) || null;
}

function toWorker(r) {
  return {
    id: r.id, name: r.name, cardCode: r.card_code, active: r.active,
    deleted: r.deleted, newDayAt: r.new_day_at, createdAt: r.created_at
  };
}
function toAttendance(r) {
  return {
    id: r.id, workerId: r.worker_id, date: r.date,
    checkIn: r.check_in, checkOut: r.check_out, open: r.open
  };
}
function toLog(r) {
  return {
    id: r.id, time: r.time, action: r.action,
    details: r.details, data: r.data, undone: r.undone
  };
}

async function openDB() { return; }

const DB = {
  async addWorker(name, cardCode) {
    const dup = await sb("workers?deleted=eq.false&card_code=eq." + encodeURIComponent(cardCode) + "&select=id");
    if (dup.length) {
      const err = new Error("duplicate card");
      err.name = "ConstraintError";
      throw err;
    }
    const rows = await sb("workers", {
      method: "POST",
      body: JSON.stringify({ name, card_code: cardCode })
    });
    return rows[0].id;
  },
  async allWorkers() {
    const rows = await sb("workers?select=*&order=id.asc");
    return rows.map(toWorker);
  },
  async allAttendance() {
    const rows = await sb("attendance?select=*&order=id.asc");
    return rows.map(toAttendance);
  },
  async allLog() {
    const rows = await sb("op_log?select=*&order=id.asc");
    return rows.map(toLog);
  },
  async newDay(workerId) {
    const cur = await sb("workers?id=eq." + workerId + "&select=new_day_at");
    const prev = cur[0] ? cur[0].new_day_at : null;
    await sb("workers?id=eq." + workerId, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ new_day_at: new Date().toISOString() })
    });
    return prev;
  },
  async deleteWorker(workerId) {
    await sb("workers?id=eq." + workerId, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ deleted: true })
    });
  },
  async addLog(action, details, data) {
    const rows = await sb("op_log", {
      method: "POST",
      body: JSON.stringify({ action, details, data: data || null })
    });
    return rows[0].id;
  },
  async checkIn(workerId) {
    const now = new Date();
    const rows = await sb("attendance", {
      method: "POST",
      body: JSON.stringify({
        worker_id: workerId, date: cairoDate(now),
        check_in: now.toISOString(), check_out: null, open: true
      })
    });
    return rows[0].id;
  },
  async checkOut(recordId) {
    await sb("attendance?id=eq." + recordId, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ check_out: new Date().toISOString(), open: false })
    });
  },
  async recordsForDate(date) {
    const rows = await sb("attendance?date=eq." + date + "&select=*");
    return rows.map(toAttendance);
  },
  async recordsBetween(from, to) {
    const rows = await sb("attendance?date=gte." + from + "&date=lte." + to + "&select=*");
    return rows.map(toAttendance);
  },
  async openRecords() {
    const rows = await sb("attendance?open=eq.true&select=*");
    return rows.map(toAttendance);
  },
  async recentLog(limit) {
    const rows = await sb("op_log?select=*&order=id.desc&limit=" + limit);
    return rows.map(toLog);
  },
  async undoLast(todayStr) {
    const rows = await sb("op_log?select=*&order=id.desc&limit=50");
    for (const r of rows) {
      const e = toLog(r);
      if (cairoDate(new Date(e.time)) !== todayStr) continue;
      const type = entryType(e);
      if (e.undone || !type) continue;

      await sb("op_log?id=eq." + e.id, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({ undone: true })
      });

      if (type === "in") {
        await sb("attendance?id=eq." + e.data.recordId, { method: "DELETE", prefer: "return=minimal" });
      } else if (type === "out") {
        await sb("attendance?id=eq." + e.data.recordId, {
          method: "PATCH", prefer: "return=minimal",
          body: JSON.stringify({ check_out: null, open: true })
        });
      } else if (type === "addWorker") {
        await sb("workers?id=eq." + e.data.workerId, { method: "DELETE", prefer: "return=minimal" });
      } else if (type === "newDay") {
        await sb("workers?id=eq." + e.data.workerId, {
          method: "PATCH", prefer: "return=minimal",
          body: JSON.stringify({ new_day_at: e.data.prev })
        });
      } else if (type === "deleteWorker") {
        await sb("workers?id=eq." + e.data.workerId, {
          method: "PATCH", prefer: "return=minimal",
          body: JSON.stringify({ deleted: false })
        });
      }

      await sb("op_log", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({ action: "تراجع", details: e.action + " — " + e.details })
      });
      return e;
    }
    return null;
  }
};
