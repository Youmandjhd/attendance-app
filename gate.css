const ACCESS_KEY = "07915236";
const GATE_STORAGE_KEY = "attendance_access_ok";

function checkGate() {
  const val = document.getElementById("gateInput").value.trim();
  if (val === ACCESS_KEY) {
    localStorage.setItem(GATE_STORAGE_KEY, "1");
    document.getElementById("gateOverlay").classList.add("hide");
    window.dispatchEvent(new Event("app-unlocked"));
  } else {
    document.getElementById("gateErr").textContent = "مفتاح الوصول غير صحيح";
    document.getElementById("gateInput").value = "";
    document.getElementById("gateInput").focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("gateBtn").onclick = checkGate;
  document.getElementById("gateInput").onkeydown = e => {
    if (e.key === "Enter") checkGate();
  };
  if (localStorage.getItem(GATE_STORAGE_KEY) === "1") {
    document.getElementById("gateOverlay").classList.add("hide");
  } else {
    document.getElementById("gateInput").focus();
  }
});
