async function exportBackup() {
  try {
    const [workers, attendance, log] = await Promise.all([
      tx("workers", "readonly", s => s.getAll()),
      tx("attendance", "readonly", s => s.getAll()),
      tx("log", "readonly", s => s.getAll())
    ]);
    const payload = {
      app: "attendance-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      workers, attendance, log
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = cairoDate().replaceAll("-", "");
    a.href = url;
    a.download = "attendance-backup-" + stamp + ".json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("تم تنزيل النسخة الاحتياطية");
  } catch (err) {
    toast("تعذر إنشاء النسخة الاحتياطية");
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await readFileAsText(file));
  } catch {
    toast("الملف غير صالح");
    return;
  }
  if (!data || data.app !== "attendance-backup" || !Array.isArray(data.workers)) {
    toast("هذا الملف ليس نسخة احتياطية صحيحة لهذا التطبيق");
    return;
  }
  const ok = confirm(
    "سيتم حذف كل البيانات الحالية واستبدالها بالنسخة الاحتياطية بتاريخ " +
    fmtDateTime(data.exportedAt) +
    "\nعدد العمال في النسخة: " + data.workers.length +
    "\nهل أنت متأكد؟"
  );
  if (!ok) return;
  try {
    await new Promise((resolve, reject) => {
      const t = db.transaction(["workers", "attendance", "log"], "readwrite");
      t.objectStore("workers").clear();
      t.objectStore("attendance").clear();
      t.objectStore("log").clear();
      for (const w of data.workers) t.objectStore("workers").put(w);
      for (const a of data.attendance || []) t.objectStore("attendance").put(a);
      for (const l of data.log || []) t.objectStore("log").put(l);
      t.oncomplete = resolve;
      t.onabort = () => reject(t.error);
    });
    toast("تم استرجاع النسخة الاحتياطية بنجاح");
    await loadWorkers();
    await loadAttendance();
  } catch (err) {
    toast("حدث خطأ أثناء الاسترجاع");
  }
}

$("backupBtn").onclick = exportBackup;
$("restoreBtn").onclick = () => $("restoreFile").click();
$("restoreFile").onchange = e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) importBackup(f);
};
