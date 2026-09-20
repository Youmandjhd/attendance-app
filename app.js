const $ = id => document.getElementById(id);
let workers = [];

function normalizeDigits(s) {
  return s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
}

function render() {
  const q = normalizeDigits($("search").value.trim()).toLowerCase();
  const shown = workers.filter(w =>
    w.name.toLowerCase().includes(q) || w.cardCode.toLowerCase().includes(q));
  $("count").textContent = "عدد العمال: " + workers.length +
    (q ? " — نتائج البحث: " + shown.length : "");
  const list = $("list");
  list.innerHTML = "";
  for (const w of shown) {
    const li = document.createElement("li");
    const name = document.createElement("div");
    name.className = "w-name";
    name.textContent = w.name;
    const card = document.createElement("div");
    card.className = "w-card";
    card.textContent = "بطاقة: " + w.cardCode;
    li.append(name, card);
    list.append(li);
  }
}

async function loadWorkers() {
  workers = await DB.allWorkers();
  workers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  render();
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
    await DB.addWorker(name, cardCode);
    await DB.addLog("إضافة عامل", name + " — " + cardCode);
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
  await loadWorkers();
}
init();
