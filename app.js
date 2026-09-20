const $ = id => document.getElementById(id);
let workers = [];
let openByWorker = new Map();
let doneMsByWorker = new Map();
let busy = false;
let toastTimer;

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
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("ar-EG",
    { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" });
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

function render() {
  const q = normalizeDigits($("search").value.trim()).toLowerCase();
  const shown = workers.filter(w =>
    w.name.toLowerCase().includes(q) || w.cardCode.toLowerCase().includes(q));
  $("count").textContent = "عدد العمال: " + workers.length +
    " — قيد العمل: " + openByWorker.size +
    (q ? " — نتائج البحث: " + shown.length : "");
  const list = $("list");
  list.innerHTML = "";
  const now = Date.now();

  for (const w of shown) {
    const open = openByWorker.get(w.id);
    const doneMs = doneMsByWorker.get(w.id);
    let statusText = "لم يسجل حضور";
    let statusCls = "none";
    let hoursText = "";

    if (open) {
      statusText = "قيد العمل";
      statusCls = "working";
      hoursText = "حضور " + fmtTime(open.checkIn) +
        " — ساعات العمل: " + fmtDuration(now - new Date(open.checkIn).getTime());
    } else if (doneMs !== undefined) {
      statusText = "تم الحضور والانصراف";
      statusCls = "done";
      hoursText = "ساعات العمل: " + fmtDuration(doneMs);
    }

    const li = el("li", "item");
    const info = el("div", "info");
    const top = el("div", "w-top");
    top.append(el("span", "w-name", w.name), el("span", "badge " + statusCls, statusText));
    info.append(top, el("div", "w-card", "بطاقة: " + w.cardCode));
    if (hoursText) info.append(el("div", "w-hours", hoursText));

    const btns = el("div", "btns");
    const bIn = el("button", "btn-in", "حضور");
    bIn.dataset.act = "in";
    bIn.dataset.id = w.id;
    bIn.disabled = !!open || doneMs !== undefined;
    const bOut = el("button", "btn-out", "انصراف");
    bOut.dataset.act = "out";
    bOut.dataset.id = w.id;
    bOut.disabled = !open;
    btns.append(bIn, bOut);

    li.append(info, btns);
    list.append(li);
  }
}

async function loadWorkers() {
  workers = await DB.allWorkers();
  workers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  render();
}

async function loadAttendance() {
  const today = cairoDate();
  const todayRecs = await DB.recordsForDate(today);
  const openRecs = await DB.openRecords();
  openByWorker = new Map(openRecs.map(r => [r.workerId, r]));
  doneMsByWorker = new Map();
  for (const r of todayRecs) {
    if (r.checkOut) {
      const ms = new Date(r.checkOut) - new Date(r.checkIn);
      doneMsByWorker.set(r.workerId, (doneMsByWorker.get(r.workerId) || 0) + ms);
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
      if (openByWorker.has(workerId) || doneMsByWorker.has(workerId)) return;
      const recordId = await DB.checkIn(workerId);
      await DB.addLog("تسجيل حضور", w.name, { type: "in", workerId, recordId });
    } else {
      const rec = openByWorker.get(workerId);
      if (!rec) return;
      await DB.checkOut(rec.id);
      await DB.addLog("تسجيل انصراف", w.name, { type: "out", workerId, recordId: rec.id });
    }
    await loadAttendance();
  } catch (err) {
    toast("حدث خطأ أثناء التسجيل");
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
    toast("حدث خطأ أثناء التراجع");
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
    $("err").textContent = err && err.name === "ConstraintError"
      ? "رقم البطاقة مسجل مسبقًا"
      : "حدث خطأ أثناء الحفظ";
  }
}

async function init() {
  tick();
  setInterval(tick, 1000);
  await openDB();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  $("addBtn").onclick = openDialog;
  $("cancelBtn").onclick = () => $("dlg").close();
  $("form").onsubmit = saveWorker;
  $("search").oninput = render;
  $("undoBtn").onclick = doUndo;
  $("logBtn").onclick = showLog;
  $("logClose").onclick = () => $("logDlg").close();
  $("list").onclick = e => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    doAction(b.dataset.act, Number(b.dataset.id));
  };
  await loadWorkers();
  await loadAttendance();
  setInterval(loadAttendance, 30000);
}
init();
