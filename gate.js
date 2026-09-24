(function() {
  var ACCESS_KEY = "07915236";
  var GATE_STORAGE_KEY = "attendance_access_ok";
  var GATE_VERSION = "v7";

  function normalize(s) {
    return s.replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }

  function showMsg(msg) {
    var e = document.getElementById("gateErr");
    if (e) e.textContent = msg;
  }

  function unlock() {
    try { localStorage.setItem(GATE_STORAGE_KEY, "1"); } catch (e) {}
    var ov = document.getElementById("gateOverlay");
    if (ov) ov.classList.add("hide");
    window.dispatchEvent(new Event("app-unlocked"));
  }

  function check() {
    try {
      var input = document.getElementById("gateInput");
      var raw = input ? input.value : "";
      var val = normalize(raw.trim());
      if (val === ACCESS_KEY) {
        unlock();
      } else {
        showMsg("[" + GATE_VERSION + "] غير صحيح — القيمة: [" + val + "]");
      }
    } catch (err) {
      showMsg("خطأ داخلي: " + err.message);
    }
  }

  function bind() {
    try {
      var btn = document.getElementById("gateBtn");
      var input = document.getElementById("gateInput");
      if (btn) btn.addEventListener("click", check);
      if (input) {
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") check();
        });
      }
      showMsg("[" + GATE_VERSION + " — الشاشة جاهزة، اكتب المفتاح]");
      var already = false;
      try { already = localStorage.getItem(GATE_STORAGE_KEY) === "1"; } catch (e) {}
      if (already) {
        var ov = document.getElementById("gateOverlay");
        if (ov) ov.classList.add("hide");
      }
    } catch (err) {
      alert("خطأ في تحميل شاشة الدخول: " + err.message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
