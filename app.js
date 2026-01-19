/*************************
 GLOBAL STATE
*************************/
const STORAGE_KEY = "warehouse_app_state";

let appState = {
  userId: "",
  stage: 1,
  activeBin: null,
  scans: []
};

let validBins = [];

/*************************
 INIT
*************************/
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await loadBins();
  render();
});

/*************************
 LOAD BIN MASTER
*************************/
async function loadBins() {
  try {
    const res = await fetch("bins.json");
    validBins = await res.json();
  } catch (e) {
    alert("Failed to load BIN master");
  }
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
 STAGE RENDERING
*************************/
function renderStage() {
  const el = document.getElementById("stageContent");
  el.innerHTML = "";

  if (appState.stage === 2) {
    el.innerHTML = `
      <h3>Scan Bin</h3>
      <input id="binInput" placeholder="Enter / Scan Bin ID">
      <button onclick="submitBin()">Submit Bin</button>
    `;
  }

  if (appState.stage === 3) {
    el.innerHTML = `
      <h3>Active Bin: ${appState.activeBin}</h3>
      <button class="action-btn" onclick="goToSkuScan()">Scan SKU</button>
      <button onclick="resetToStage2()">Close Bin</button>
    `;
  }

  if (appState.stage === 4) {
    el.innerHTML = `
      <h3>Scanning SKU for Bin: ${appState.activeBin}</h3>
      <input id="skuInput" placeholder="Enter / Scan SKU">
      <button onclick="scanSku()">Add SKU</button>
      <br><br>
      <button class="action-btn" onclick="render()">Continue</button>
      <button onclick="resetToStage2()">Finish Bin</button>
    `;
  }

  if (appState.stage === 5) {
    el.innerHTML = `
      <h3>Submit Data</h3>
      <button onclick="submitToGoogle()">Submit to Google Drive</button>
    `;
  }
}

/*************************
 BIN LOGIC
*************************/
function submitBin() {
  const bin = document.getElementById("binInput").value.trim();

  if (!validBins.includes(bin)) {
    return alert("Invalid BIN ID");
  }

  appState.activeBin = bin;
  appState.stage = 3;
  saveState();
  render();
}

/*************************
 SKU LOGIC
*************************/
function goToSkuScan() {
  appState.stage = 4;
  saveState();
  render();
}

function scanSku() {
  const sku = document.getElementById("skuInput").value.trim();
  if (!sku) return alert("SKU required");

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
  document.getElementById("skuInput").value = "";
  renderPendingTable();
}

/*************************
 PENDING TABLE
*************************/
function renderPendingTable() {
  const el = document.getElementById("pendingTable");

  if (appState.scans.length === 0) {
    el.innerHTML = `<p>No pending data. All data submitted.</p>`;
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

  html += `</table>`;
  el.innerHTML = html;
}

/*************************
 GOOGLE SUBMIT (PLACEHOLDER)
*************************/
function submitToGoogle() {
  alert("Google submission will be added next step");
}
