const $ = id => document.getElementById(id);
let workers = [];
let openByWorker = new Map();
let shiftByWorker = new Map();
let busy = false;
let toastTimer;
let pressTimer = null;
let pressStart = null;
let delId = null;

function normalizeDigits(s) {
  return s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 6000);
}

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("ar-EG",
    { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" });
}

function fmtShortDate(iso) {
  return new Date(iso).toLocaleDateString("ar-EG",
    { timeZone: "Africa/Cairo", day: "numeric", month: "numeric" });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "numeric", minute: "2-digit"
  });
}

function fmtDuration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h.toLocaleString("ar-EG") + " س " + m.toLocaleString("ar-EG") + " د";
}

function isArmed(w) {
  const g = shiftByWorker.get(w.id);
  return !!(g && w.newDayAt && w.newDayAt > g.lastOut);
}

function render() {
  const q = normalizeDigits($("search").value.trim()).toLowerCase();
  const shown = workers.filter(w =>
    w.name.toLowerCase().includes(q) || w.cardCode.toLowerCase().includes(q));
  const working = workers.filter(w => openByWorker.has(w.id)).length;
  $("count").textContent = "عدد العمال: " + workers.length +
    " — قيد العمل: " + working +
    (q ? " — نتائج البحث: " + shown.length : "");
  const list = $("list");
  list.innerHTML = "";
  const now = Date.now();
  const today = cairoDate();

  for (const w of shown) {
    const open = openByWorker.get(w.id);
    const g = shiftByWorker.get(w.id);
    let statusText = "لم يسجل حضور";
    let statusCls = "none";
    let hoursText = "";
    let canIn = true;
    let canOut = false;
    let canNewDay = false;

    if (open) {
      const prior = g && g.date === open.date ? g.doneMs : 0;
      const dayTag = open.date !== today ? " (" + fmtShortDate(open.checkIn) + ")" : "";
      statusText = "قيد العمل";
      statusCls = "working";
      hoursText = "حضور " + fmtTime(open.checkIn) + dayTag + " — ساعات العمل: " +
        fmtDuration(prior + now - new Date(open.checkIn).getTime());
      canIn = false;
      canOut = true;
    } else if (g) {
      hoursText = "ساعات العمل: " + fmtDuration(g.doneMs);
      if (isArmed(w)) {
        statusText = "جاهز لحضور جديد";
        statusCls = "ready";
      } else {
        statusText = "تم الحضور والانصراف";
        statusCls = "done";
        canIn = false;
        canNewDay = true;
      }
    }

    const li = el("li", "item");
    const info = el("div", "info");
    const top = el("div", "w-top");
    const nm = el("span", "w-name", w.name);
    nm.dataset.id = w.id;
    top.append(nm, el("span", "badge " + statusCls, statusText));
    if (canNewDay) {
      const nd = el("button", "btn-newday", "يوم جديد");
      nd.dataset.act = "newday";
      nd.dataset.id = w.id;
      top.append(nd);
    }
    info.append(top, el("div", "w-card", "بطاقة: " + w.cardCode));
    if (hoursText) info.append(el("div", "w-hours", hoursText));

    const btns = el("div", "btns");
    const bIn = el("button", "btn-in", "حضور");
    bIn.dataset.act = "in";
    bIn.dataset.id = w.id;
    bIn.disabled = !canIn;
    const bOut = el("button", "btn-out", "انصراف");
    bOut.dataset.act = "out";
    bOut.dataset.id = w.id;
    bOut.disabled = !canOut;
    btns.append(bIn, bOut);

    li.append(info, btns);
    list.append(li);
  }
}

async function loadWorkers() {
  const all = await DB.allWorkers();
  workers = all.filter(w => !w.deleted);
  workers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  render();
}

async function loadAttendance() {
  const today = cairoDate();
  const from = cairoDate(new Date(Date.now() - 48 * 3600 * 1000));
  const recent = await DB.recordsBetween(from, today);
  const openRecs = await DB.openRecords();
  openByWorker = new Map(openRecs.map(r => [r.workerId, r]));
  shiftByWorker = new Map();
  for (const r of recent) {
    if (!r.checkOut) continue;
    if (r.date !== today && cairoDate(new Date(r.checkOut)) !== today) continue;
    const ms = new Date(r.checkOut) - new Date(r.checkIn);
    const g = shiftByWorker.get(r.workerId);
    if (!g || r.date > g.date) {
      shiftByWorker.set(r.workerId, { date: r.date, doneMs: ms, lastOut: r.checkOut });
    } else if (r.date === g.date) {
      g.doneMs += ms;
      if (r.checkOut > g.lastOut) g.lastOut = r.checkOut;
    }
  }
  render();
}

async function doAction(act, workerId) {
  if (busy) return;
  busy = true;
  try {
    const w = workers.find(x => x.id === workerId);
    if (!w) return;
    if (act === "in") {
      const locked = shiftByWorker.has(workerId) && !isArmed(w);
      if (openByWorker.has(workerId) || locked) return;
      const recordId = await DB.checkIn(workerId);
      await DB.addLog("تسجيل حضور", w.name, { type: "in", workerId, recordId });
    } else if (act === "out") {
      const rec = openByWorker.get(workerId);
      if (!rec) return;
      await DB.checkOut(rec.id);
      await DB.addLog("تسجيل انصراف", w.name, { type: "out", workerId, recordId: rec.id });
    } else if (act === "newday") {
      if (openByWorker.has(workerId) || !shiftByWorker.has(workerId) || isArmed(w)) return;
      const prev = await DB.newDay(workerId);
      await DB.addLog("يوم جديد", w.name, { type: "newDay", workerId, prev });
      await loadWorkers();
    }
    await loadAttendance();
  } catch (err) {
    toast("خطأ: " + (err && err.message ? err.message : "غير معروف"));
  } finally {
    busy = false;
  }
}

async function doUndo() {
  if (busy) return;
  busy = true;
  try {
    const e = await DB.undoLast(cairoDate());
    if (!e) {
      toast("لا توجد عمليات للتراجع عنها اليوم");
    } else {
      toast("تم التراجع عن: " + e.action + " — " + e.details);
      await loadWorkers();
      await loadAttendance();
    }
  } catch (err) {
    toast("خطأ: " + (err && err.message ? err.message : "غير معروف"));
  } finally {
    busy = false;
  }
}

async function showLog() {
  const items = await DB.recentLog(100);
  const ul = $("logList");
  ul.innerHTML = "";
  if (!items.length) ul.append(el("li", "log-empty", "لا توجد عمليات بعد"));
  for (const e of items) {
    const li = el("li", "log-item" + (e.undone ? " undone" : ""));
    li.append(el("div", "log-time", fmtDateTime(e.time)));
    li.append(el("div", "log-text",
      e.action + (e.details ? " — " + e.details : "") + (e.undone ? " (تم التراجع)" : "")));
    ul.append(li);
  }
  $("logDlg").showModal();
}

function openDialog() {
  $("form").reset();
  $("err").textContent = "";
  $("dlg").showModal();
  $("fName").focus();
}

async function saveWorker(e) {
  e.preventDefault();
  const name = $("fName").value.trim();
  const cardCode = normalizeDigits($("fCard").value.trim());
  if (!name || !cardCode) return;
  try {
    const id = await DB.addWorker(name, cardCode);
    await DB.addLog("إضافة عامل", name + " — " + cardCode, { type: "addWorker", workerId: id });
    $("dlg").close();
    await loadWorkers();
  } catch (err) {
    if (err && err.name === "ConstraintError") {
      $("err").textContent = "رقم البطاقة مسجل مسبقًا";
    } else {
      $("err").textContent = "خطأ: " + (err && err.message ? err.message : "غير معروف");
    }
  }
}

function askDelete(id) {
  const w = workers.find(x => x.id === id);
  if (!w) return;
  if (openByWorker.has(id)) {
    toast("لا يمكن حذف عامل قيد العمل — سجّل انصرافه أولًا");
    return;
  }
  delId = id;
  $("delName").textContent = w.name;
  $("delDlg").showModal();
}

async function confirmDelete() {
  if (delId === null || busy) return;
  busy = true;
  const id = delId;
  try {
    const w = workers.find(x => x.id === id);
    await DB.deleteWorker(id);
    if (w) {
      await DB.addLog("حذف عامل", w.name + " — " + w.cardCode, { type: "deleteWorker", workerId: id });
    }
    delId = null;
    $("delDlg").close();
    toast("تم حذف العامل (يمكن التراجع عنه اليوم)");
    await loadWorkers();
    await loadAttendance();
  } catch (err) {
    toast("خطأ: " + (err && err.message ? err.message : "غير معروف"));
  } finally {
    busy = false;
  }
}

function cancelPress() {
  clearTimeout(pressTimer);
  pressTimer = null;
}

function setupLongPress() {
  const list = $("list");
  list.addEventListener("pointerdown", e => {
    const n = e.target.closest(".w-name");
    if (!n) return;
    pressStart = { x: e.clientX, y: e.clientY };
    const id = Number(n.dataset.id);
    cancelPress();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      askDelete(id);
    }, 600);
  });
  list.addEventListener("pointermove", e => {
    if (pressTimer && pressStart &&
        (Math.abs(e.clientX - pressStart.x) > 10 || Math.abs(e.clientY - pressStart.y) > 10)) {
      cancelPress();
    }
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
    list.addEventListener(ev, cancelPress));
  list.addEventListener("contextmenu", e => {
    if (e.target.closest(".w-name")) e.preventDefault();
  });
}

function waitForUnlock() {
  return new Promise(resolve => {
    if (localStorage.getItem("attendance_access_ok") === "1") { resolve(); return; }
    window.addEventListener("app-unlocked", () => resolve(), { once: true });
  });
}

async function init() {
  tick();
  setInterval(tick, 1000);
  await waitForUnlock();
  $("addBtn").onclick = openDialog;
  $("cancelBtn").onclick = () => $("dlg").close();
  $("form").onsubmit = saveWorker;
  $("search").oninput = render;
  $("undoBtn").onclick = doUndo;
  $("logBtn").onclick = showLog;
  $("logClose").onclick = () => $("logDlg").close();
  $("delOk").onclick = confirmDelete;
  $("delCancel").onclick = () => { delId = null; $("delDlg").close(); };
  $("list").onclick = e => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    doAction(b.dataset.act, Number(b.dataset.id));
  };
  setupLongPress();
  try {
    await loadWorkers();
    await loadAttendance();
  } catch (err) {
    toast("خطأ في تحميل البيانات: " + (err && err.message ? err.message : "غير معروف"));
  }
  setInterval(loadAttendance, 30000);
}
init();
