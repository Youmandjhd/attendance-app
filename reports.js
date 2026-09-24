let rpMode = "day";
let rpData = null;

function rangeRecords(from, to) {
  return DB.recordsBetween(from, to);
}

function nf(n) { return n.toLocaleString("ar-EG"); }
function dec(ms) { return Math.round(ms / 36000) / 100; }
function wholeHours(ms) { return Math.floor(ms / 3600000); }
function fmtWholeHours(ms) { return nf(wholeHours(ms)) + " ساعة"; }
function sortByName(a, b) {
  return (a.w ? a.w.name : "").localeCompare(b.w ? b.w.name : "", "ar");
}
function longDate(d) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("ar-EG",
    { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function longMonth(m) {
  return new Date(m + "-15T12:00:00Z").toLocaleDateString("ar-EG",
    { timeZone: "UTC", year: "numeric", month: "long" });
}
function issued() {
  return " — وقت إصدار التقرير: " + fmtDateTime(new Date().toISOString());
}

async function buildDaily(date) {
  const recs = await rangeRecords(date, date);
  const ws = await DB.allWorkers();
  const byId = new Map(ws.map(w => [w.id, w]));
  const items = recs.map(r => ({ r, w: byId.get(r.workerId) }));
  items.sort(sortByName);
  const today = cairoDate();
  let totalMs = 0;
  let openCount = 0;
  const rows = [];
  const xrows = [];

  items.forEach(({ r, w }, i) => {
    const name = w ? w.name : "عامل محذوف";
    const card = w ? w.cardCode : "";
    const inT = fmtTime(r.checkIn);
    let outT = "—";
    let hours = "—";
    let x = "";
    let status;
    if (r.checkOut) {
      const ms = new Date(r.checkOut) - new Date(r.checkIn);
      totalMs += ms;
      outT = fmtTime(r.checkOut);
      hours = fmtDuration(ms);
      x = dec(ms);
      status = "تم الحضور والانصراف";
    } else {
      openCount++;
      status = date === today ? "قيد العمل" : "لم يسجل انصراف";
    }
    rows.push([nf(i + 1), name, card, inT, outT, hours, status]);
    xrows.push([i + 1, name, card, inT, outT, x, status]);
  });

  return {
    file: "daily-" + date,
    title: "تقرير الحضور اليومي",
    sub: "التاريخ: " + longDate(date) +
      " — عدد العمال: " + nf(items.length) +
      " — إجمالي الساعات: " + fmtDuration(totalMs) +
      (openCount ? " — بدون انصراف: " + nf(openCount) : "") + issued(),
    head: ["م", "الاسم", "رقم البطاقة", "الحضور", "الانصراف", "ساعات العمل", "الحالة"],
    rows,
    foot: ["", "الإجمالي", "", "", "", fmtDuration(totalMs), ""],
    xhead: ["م", "الاسم", "رقم البطاقة", "الحضور", "الانصراف", "ساعات العمل (عشري)", "الحالة"],
    xrows,
    xfoot: ["", "الإجمالي", "", "", "", dec(totalMs), ""]
  };
}

async function buildMonthly(month) {
  const recs = await rangeRecords(month + "-01", month + "-31");
  const ws = await DB.allWorkers();
  const byId = new Map(ws.map(w => [w.id, w]));
  const g = new Map();
  for (const r of recs) {
    let x = g.get(r.workerId);
    if (!x) { x = { dates: new Set(), ms: 0, open: 0 }; g.set(r.workerId, x); }
    x.dates.add(r.date);
    if (r.checkOut) x.ms += new Date(r.checkOut) - new Date(r.checkIn);
    else x.open++;
  }
  const items = [...g.entries()].map(([id, x]) => ({ w: byId.get(id), x }));
  items.sort(sortByName);
  let totalMs = 0;
  let totalDays = 0;
  const rows = [];
  const xrows = [];

  items.forEach(({ w, x }, i) => {
    const name = w ? w.name : "عامل محذوف";
    const card = w ? w.cardCode : "";
    totalMs += x.ms;
    totalDays += x.dates.size;
    rows.push([nf(i + 1), name, card, nf(x.dates.size), fmtWholeHours(x.ms),
      x.open ? nf(x.open) + " بدون انصراف" : ""]);
    xrows.push([i + 1, name, card, x.dates.size, wholeHours(x.ms),
      x.open ? x.open + " بدون انصراف" : ""]);
  });

  return {
    file: "monthly-" + month,
    title: "تقرير الحضور الشهري",
    sub: "الشهر: " + longMonth(month) +
      " — عدد العمال: " + nf(items.length) +
      " — إجمالي الساعات: " + fmtWholeHours(totalMs) + issued(),
    head: ["م", "الاسم", "رقم البطاقة", "أيام العمل", "إجمالي الساعات", "ملاحظات"],
    rows,
    foot: ["", "الإجمالي", "", nf(totalDays), fmtWholeHours(totalMs), ""],
    xhead: ["م", "الاسم", "رقم البطاقة", "أيام العمل", "إجمالي الساعات الكاملة", "ملاحظات"],
    xrows,
    xfoot: ["", "الإجمالي", "", totalDays, wholeHours(totalMs), ""]
  };
}

function renderReport() {
  const d = rpData;
  $("rpTitle").textContent = d.title;
  $("rpSub").textContent = d.sub;
  const t = $("rpTable");
  t.innerHTML = "";

  const thead = el("thead");
  const hr = el("tr");
  d.head.forEach(h => hr.append(el("th", "", h)));
  thead.append(hr);
  t.append(thead);

  const tb = el("tbody");
  if (!d.rows.length) {
    const tr = el("tr");
    const td = el("td", "rp-empty", "لا توجد بيانات في هذه الفترة");
    td.colSpan = d.head.length;
    tr.append(td);
    tb.append(tr);
  }
  d.rows.forEach(r => {
    const tr = el("tr");
    r.forEach(c => tr.append(el("td", "", c)));
    tb.append(tr);
  });
  t.append(tb);

  if (d.rows.length) {
    const tf = el("tfoot");
    const tr = el("tr");
    d.foot.forEach(c => tr.append(el("td", "", c)));
    tf.append(tr);
    t.append(tf);
  }
}

async function loadReport() {
  try {
    if (rpMode === "day") {
      if (!$("rpDate").value) return;
      rpData = await buildDaily($("rpDate").value);
    } else {
      if (!$("rpMonth").value) return;
      rpData = await buildMonthly($("rpMonth").value);
    }
    renderReport();
  } catch (err) {
    toast("تعذر تحميل التقرير");
  }
}

function setMode(m) {
  rpMode = m;
  $("tabDay").classList.toggle("active", m === "day");
  $("tabMonth").classList.toggle("active", m === "month");
  $("rpDate").classList.toggle("hide", m !== "day");
  $("rpMonth").classList.toggle("hide", m !== "month");
  loadReport();
}

function openReports() {
  $("mainView").classList.add("hide");
  $("reportView").classList.remove("hide");
  $("rpDate").value = cairoDate();
  $("rpMonth").value = cairoDate().slice(0, 7);
  setMode("day");
  window.scrollTo(0, 0);
}

function closeReports() {
  $("reportView").classList.add("hide");
  $("mainView").classList.remove("hide");
}

function exportExcel() {
  if (!rpData) return;
  if (typeof XLSX === "undefined") {
    toast("مكتبة Excel لم تُحمَّل — تأكد من الاتصال بالإنترنت");
    return;
  }
  const aoa = [[rpData.title], [rpData.sub], [], rpData.xhead, ...rpData.xrows];
  if (rpData.xrows.length) aoa.push(rpData.xfoot);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = rpData.xhead.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "التقرير");
  XLSX.writeFile(wb, rpData.file + ".xlsx");
}

$("repBtn").onclick = openReports;
$("rpBack").onclick = closeReports;
$("tabDay").onclick = () => setMode("day");
$("tabMonth").onclick = () => setMode("month");
$("rpDate").onchange = loadReport;
$("rpMonth").onchange = loadReport;
$("rpPrint").onclick = () => window.print();
$("rpExcel").onclick = exportExcel;
