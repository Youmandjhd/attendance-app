async function exportBackup() {
  try {
    const [workers, attendance, log] = await Promise.all([
      DB.allWorkers(), DB.allAttendance(), DB.allLog()
    ]);
    const payload = {
      app: "attendance-backup", version: 2,
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
    "سيتم إضافة بيانات هذا الملف كعمال وسجلات جديدة في قاعدة البيانات الحالية (لن يتم حذف أي شيء موجود حاليًا).\n" +
    "تاريخ النسخة: " + fmtDateTime(data.exportedAt) +
    "\nعدد العمال في الملف: " + data.workers.length +
    "\nقد يستغرق هذا بعض الوقت. هل تريد المتابعة؟"
  );
  if (!ok) return;

  const btn = $("restoreBtn");
  const original = btn.textContent;
  btn.disabled = true;

  try {
    const workerMap = new Map();
    for (let i = 0; i < data.workers.length; i++) {
      const w = data.workers[i];
      btn.textContent = "جارٍ الاستيراد: عمال " + (i + 1) + "/" + data.workers.length;
      const newId = await DB.addWorker(w.name, w.cardCode).catch(async () => {
        const rows = await sb("workers", {
          method: "POST",
          body: JSON.stringify({
            name: w.name, card_code: w.cardCode,
            active: w.active !== false, deleted: !!w.deleted,
            new_day_at: w.newDayAt || null
          })
        });
        return rows[0].id;
      });
      workerMap.set(w.id, newId);
    }

    const attMap = new Map();
    const atts = data.attendance || [];
    for (let i = 0; i < atts.length; i++) {
      const a = atts[i];
      const wid = workerMap.get(a.workerId);
      if (!wid) continue;
      btn.textContent = "جارٍ الاستيراد: حضور " + (i + 1) + "/" + atts.length;
      const rows = await sb("attendance", {
        method: "POST",
        body: JSON.stringify({
          worker_id: wid, date: a.date,
          check_in: a.checkIn, check_out: a.checkOut || null,
          open: !a.checkOut
        })
      });
      attMap.set(a.id, rows[0].id);
    }

    const logs = data.log || [];
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      btn.textContent = "جارٍ الاستيراد: سجل " + (i + 1) + "/" + logs.length;
      let nd = l.data;
      if (nd) {
        nd = Object.assign({}, nd);
        if (nd.workerId != null) nd.workerId = workerMap.get(nd.workerId) || nd.workerId;
        if (nd.recordId != null) nd.recordId = attMap.get(nd.recordId) || nd.recordId;
      }
      await sb("op_log", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({
          action: l.action, details: l.details, data: nd, undone: !!l.undone
        })
      });
    }

    toast("تم استيراد " + data.workers.length + " عامل بنجاح");
    await loadWorkers();
    await loadAttendance();
  } catch (err) {
    toast("حدث خطأ أثناء الاستيراد — راجع البيانات وحاول مرة أخرى");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

$("backupBtn").onclick = exportBackup;
$("restoreBtn").onclick = () => $("restoreFile").click();
$("restoreFile").onchange = e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) importBackup(f);
};
