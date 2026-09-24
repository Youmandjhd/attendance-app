const ACCESS_KEY = "07915236";
const GATE_STORAGE_KEY = "attendance_access_ok";

function gateNormalizeDigits(s) {
  return s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function unlockApp() {
  try {
    localStorage.setItem(GATE_STORAGE_KEY, "1");
  } catch (err) {}
  document.getElementById("gateOverlay").classList.add("hide");
  window.dispatchEvent(new Event("app-unlocked"));
}

function checkGate() {
  const raw = document.getElementById("gateInput").value;
  const val = gateNormalizeDigits(raw.trim());
  if (val === ACCESS_KEY) {
    unlockApp();
  } else {
    document.getElementById("gateErr").textContent =
      "غير صحيح — القيمة المكتوبة: [" + val + "] بطول " + val.length + " حرف";
  }
}

document.getElementById("gateBtn").onclick = checkGate;
document.getElementById("gateInput").onkeydown = e => {
  if (e.key === "Enter") checkGate();
};

let already = false;
try {
  already = localStorage.getItem(GATE_STORAGE_KEY) === "1";
} catch (err) {
  already = false;
}
if (already) {
  document.getElementById("gateOverlay").classList.add("hide");
} else {
  document.getElementById("gateInput").focus();
}
