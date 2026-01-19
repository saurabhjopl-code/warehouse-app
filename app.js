/*************************
 CONFIG
*************************/
const STORAGE_KEY = "warehouse_app_state";
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx4PhWYeVrR-Mfzu6UcGrAKObE-zSmooUlmdjZnaq1ElQ5l_KlrSVZqY5tpggo1-cn2/exec";

/*************************
 STATE
*************************/
let appState = {
  userId: "",
  stage: 1,
  activeBin: null,
  scans: []
};

let validBins = [];
let detector = null;
let stream = null;
let scanInterval = null;

/*************************
 INIT
*************************/
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await loadBins();
  initBarcode();
  render();
});

/*************************
 LOAD BIN MASTER
*************************/
async function loadBins() {
  const res = await fetch("bins.json");
  validBins = await res.json();
}

/*************************
 BARCODE INIT
*************************/
function initBarcode() {
  if (!("BarcodeDetector" in window)) {
    alert("Use Chrome on Android for barcode scanning");
    return;
  }

  detector = new BarcodeDetector({
    formats: ["code_128", "ean_13", "ean_8", "qr_code"]
  });
}

/*************************
 STATE
*************************/
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadState() {
  const s = localStorage.getItem(STORAGE_KEY);
  if (s) appState = JSON.parse(s);
}

function resetToStage2() {
  stopCamera();
  appState.stage = 2;
  appState.activeBin = null;
  saveState();
  render();
}

/*************************
 LOGIN
*************************/
function login() {
  const userId = document.getElementById("userIdInput").value.trim();
  if (!userId) return alert("User ID required");

  appState.userId = userId;
  appState.stage = 2;
  saveState();
  render();
}

/*************************
 RENDER
*************************/
function render() {
  document.getElementById("loginScreen").classList.toggle("hidden", !!appState.userId);
  document.getElementById("mainScreen").classList.toggle("hidden", !appState.userId);

  if (!appState.userId) return;

  document.getElementById("userLabel").innerText = appState.userId;
  document.getElementById("stageLabel").innerText = appState.stage;

  renderStage();
  renderPendingTable();
}

/*************************
 STAGES
*************************/
function renderStage() {
  const el = document.getElementById("stageContent");
  el.innerHTML = "";

  // STAGE 2 – USER GESTURE REQUIRED
  if (appState.stage === 2) {
    el.innerHTML = `
      <h3>Scan BIN</h3>
      <button onclick="startCamera('bin')">▶ Start BIN Scan</button>
    `;
  }

  // STAGE 3
  if (appState.stage === 3) {
    el.innerHTML = `
      <h3>Active Bin: ${appState.activeBin}</h3>
      <button onclick="goToSkuScan()">Start SKU Scan</button>
      <button onclick="resetToStage2()">Close Bin</button>
    `;
  }

  // STAGE 4
  if (appState.stage === 4) {
    el.innerHTML = `
      <h3>Scanning SKU</h3>
      <button onclick="resetToStage2()">Finish Bin</button>
    `;
    startCamera("sku");
  }

  // STAGE 5
  if (appState.stage === 5) {
    el.innerHTML = `
      <h3>Submit Data</h3>
      <button onclick="submitToGoogle()">Confirm Submit</button>
      <button onclick="resetToStage2()">Cancel</button>
    `;
  }
}

/*************************
 CAMERA (USER-GESTURE SAFE)
*************************/
async function startCamera(mode) {
  stopCamera();

  document.getElementById("cameraBox").classList.remove("hidden");
  const video = document.getElementById("video");

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = stream;
  await video.play();

  scanInterval = setInterval(async () => {
    if (!stream) return;

    const codes = await detector.detect(video);
    if (codes.length > 0) {
      const value = codes[0].rawValue;
      stopCamera();

      if (mode === "bin") handleBinScan(value);
      if (mode === "sku") handleSkuScan(value);
    }
  }, 300);
}

function stopCamera() {
  document.getElementById("cameraBox").classList.add("hidden");

  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

/*************************
 BIN
*************************/
function handleBinScan(bin) {
  if (!validBins.includes(bin)) {
    alert("Invalid BIN. Try again.");
    render();
    return;
  }

  appState.activeBin = bin;
  appState.stage = 3;
  saveState();
  render();
}

/*************************
 SKU
*************************/
function goToSkuScan() {
  appState.stage = 4;
  saveState();
  render();
}

function handleSkuScan(sku) {
  let row = appState.scans.find(
    r => r.binId === appState.activeBin && r.skuId === sku
  );

  if (row) {
    row.unit++;
    row.timestamp = new Date().toISOString();
  } else {
    appState.scans.push({
      binId: appState.activeBin,
      skuId: sku,
      unit: 1,
      timestamp: new Date().toISOString()
    });
  }

  saveState();
  renderPendingTable();
  startCamera("sku");
}

/*************************
 SUBMIT
*************************/
async function submitToGoogle() {
  const payload = appState.scans.map(r => ({
    userId: appState.userId,
    date: new Date().toLocaleDateString(),
    binId: r.binId,
    skuId: r.skuId,
    scanCount: r.unit,
    timestamp: r.timestamp
  }));

  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) throw new Error();

    appState.scans = [];
    appState.activeBin = null;
    appState.stage = 2;
    saveState();
    alert("Data submitted");
    render();
  } catch {
    alert("Submission failed. Data saved locally.");
  }
}

/*************************
 TABLE
*************************/
function renderPendingTable() {
  const el = document.getElementById("pendingTable");

  if (!appState.scans.length) {
    el.innerHTML = "<p>No pending data. All data submitted.</p>";
    return;
  }

  let html = `<table>
    <tr><th>BIN ID</th><th>SKU ID</th><th>UNIT</th></tr>`;

  appState.scans.forEach(r => {
    html += `<tr><td>${r.binId}</td><td>${r.skuId}</td><td>${r.unit}</td></tr>`;
  });

  html += "</table>";
  el.innerHTML = html;
}
