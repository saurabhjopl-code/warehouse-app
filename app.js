/*************************
 GLOBAL CONFIG
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
let stream = null;
let detector = null;

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
    alert("Barcode scanning not supported on this device");
    return;
  }

  detector = new BarcodeDetector({
    formats: ["code_128", "ean_13", "qr_code"]
  });
}

/*************************
 STATE HELPERS
*************************/
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadState() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) appState = JSON.parse(data);
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
  document.getElementById("loginScreen")
    .classList.toggle("hidden", !!appState.userId);

  document.getElementById("mainScreen")
    .classList.toggle("hidden", !appState.userId);

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

  // STAGE 2 – AUTO BIN SCAN
  if (appState.stage === 2) {
    el.innerHTML = `<h3>Scan BIN (Camera)</h3>`;
    startCamera("bin");
  }

  // STAGE 3 – CONFIRM BIN
  if (appState.stage === 3) {
    el.innerHTML = `
      <h3>Active Bin: ${appState.activeBin}</h3>
      <button onclick="goToSkuScan()">Start SKU Scan</button>
      <button onclick="resetToStage2()">Close Bin</button>
    `;
  }

  // STAGE 4 – AUTO SKU SCAN
  if (appState.stage === 4) {
    el.innerHTML = `
      <h3>Scanning SKU (Camera)</h3>
      <button onclick="resetToStage2()">Finish Bin</button>
    `;
    startCamera("sku");
  }

  // STAGE 5 – SUBMIT
  if (appState.stage === 5) {
    el.innerHTML = `
      <h3>Submit Data</h3>
      <button onclick="submitToGoogle()">Confirm Submit</button>
      <button onclick="resetToStage2()">Cancel</button>
    `;
  }
}

/*************************
 CAMERA LOGIC
*************************/
async function startCamera(mode) {
  if (!detector) return;

  stopCamera();

  document.getElementById("cameraBox").classList.remove("hidden");

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  const video = document.getElementById("video");
  video.srcObject = stream;

  const scanLoop = async () => {
    if (!stream) return;

    const barcodes = await detector.detect(video);

    if (barcodes.length > 0) {
      const value = barcodes[0].rawValue;
      stopCamera();

      if (mode === "bin") handleBinScan(value);
      if (mode === "sku") handleSkuScan(value);

      return;
    }

    requestAnimationFrame(scanLoop);
  };

  scanLoop();
}

function stopCamera() {
  document.getElementById("cameraBox").classList.add("hidden");

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

/*************************
 BIN HANDLER
*************************/
function handleBinScan(bin) {
  if (!validBins.includes(bin)) {
    alert("Invalid BIN scanned. Try again.");
    startCamera("bin");
    return;
  }

  appState.activeBin = bin;
  appState.stage = 3;
  saveState();
  render();
}

/*************************
 SKU HANDLER
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
    row.unit += 1;
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

  // AUTO RESTART CAMERA FOR NEXT SKU
  startCamera("sku");
}

/*************************
 SUBMISSION
*************************/
function goToSubmit() {
  if (appState.scans.length === 0) {
    alert("No pending data");
    return;
  }

  appState.stage = 5;
  saveState();
  render();
}

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
    alert("Data submitted successfully");
    render();

  } catch {
    alert("Submission failed. Data saved locally.");
  }
}

/*************************
 PENDING TABLE
*************************/
function renderPendingTable() {
  const el = document.getElementById("pendingTable");

  if (appState.scans.length === 0) {
    el.innerHTML = "<p>No pending data. All data submitted.</p>";
    return;
  }

  let html = `
    <table>
      <tr>
        <th>BIN ID</th>
        <th>SKU ID</th>
        <th>UNIT</th>
      </tr>
  `;

  appState.scans.forEach(r => {
    html += `
      <tr>
        <td>${r.binId}</td>
        <td>${r.skuId}</td>
        <td>${r.unit}</td>
      </tr>
    `;
  });

  html += "</table>";
  el.innerHTML = html;
}
