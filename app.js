const UUID = {
  service: "b7a1f001-7a56-4f42-9f4d-2b6f0c6a5000",
  ssid: "b7a1f001-7a56-4f42-9f4d-2b6f0c6a5001",
  password: "b7a1f001-7a56-4f42-9f4d-2b6f0c6a5002",
  command: "b7a1f001-7a56-4f42-9f4d-2b6f0c6a5003",
  status: "b7a1f001-7a56-4f42-9f4d-2b6f0c6a5004",
};

const q = new URLSearchParams(location.search);
const expectedHubId = q.get("hub") || "PZ-HUB-002";
const expectedBleName = q.get("ble") || "PEZPO-HUB2";
const setupToken = q.get("token") || "";

const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

$("title").textContent = `Configurer ${expectedHubId}`;
$("hubName").textContent = expectedBleName;

let device, server, service, ssidChar, passwordChar, commandChar, statusChar;
let selectedSsid = "";
let connectedIp = "";
const networks = new Map();

function showOnly(id) {
  ["startCard","wifiCard","successCard","errorCard"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function webBluetoothAvailable() {
  return !!navigator.bluetooth;
}

if (isIOS() && !webBluetoothAvailable()) {
  $("unsupportedCard").classList.remove("hidden");
  $("connectBtn").disabled = true;
}

function errorMessage(code) {
  const map = {
    BAD_PASSWORD: "Mot de passe Wi-Fi incorrect.",
    CONNECTION_FAILED: "Connexion Wi-Fi impossible.",
    TIMEOUT: "La connexion Wi-Fi a expiré.",
    SCAN_FAILED: "Impossible de rechercher les réseaux Wi-Fi.",
    SCAN_TIMEOUT: "La recherche Wi-Fi a expiré.",
    SSID_MISSING: "Aucun réseau Wi-Fi sélectionné.",
    INTERNAL: "Erreur interne du Hub."
  };
  return map[code] || `Erreur du Hub : ${code}`;
}

function fail(message) {
  $("errorText").textContent = message;
  showOnly("errorCard");
}

async function connectBluetooth() {
  if (!webBluetoothAvailable()) {
    fail("Ce navigateur ne prend pas en charge Web Bluetooth. Sur Android, ouvrez cette page avec Chrome.");
    return;
  }

  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "RECHERCHE…";

  try {
    // Doit être appelé depuis un clic utilisateur.
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: expectedBleName },
        { services: [UUID.service] }
      ],
      optionalServices: [UUID.service]
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!connectedIp) {
        fail("Connexion Bluetooth interrompue.");
      }
    });

    server = await device.gatt.connect();
    service = await server.getPrimaryService(UUID.service);

    [ssidChar, passwordChar, commandChar, statusChar] = await Promise.all([
      service.getCharacteristic(UUID.ssid),
      service.getCharacteristic(UUID.password),
      service.getCharacteristic(UUID.command),
      service.getCharacteristic(UUID.status)
    ]);

    await statusChar.startNotifications();
    statusChar.addEventListener("characteristicvaluechanged", handleStatus);

    showOnly("wifiCard");
    await scanWifi();
  } catch (err) {
    $("connectBtn").disabled = false;
    $("connectBtn").textContent = "CONNECTER À PEZPO";
    fail(err?.message || String(err));
  }
}

async function writeText(characteristic, text) {
  const bytes = enc.encode(text);
  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(bytes);
  } else {
    await characteristic.writeValue(bytes);
  }
}

async function scanWifi() {
  networks.clear();
  selectedSsid = "";
  $("wifiConnectBtn").disabled = true;
  $("networks").innerHTML = "";
  $("scanState").textContent = "Recherche des réseaux Wi-Fi…";
  $("rescanBtn").disabled = true;
  try {
    await writeText(commandChar, "scan");
  } catch (err) {
    $("rescanBtn").disabled = false;
    fail("Impossible de lancer la recherche Wi-Fi : " + (err?.message || err));
  }
}

function handleStatus(event) {
  const view = event.target.value;
  const raw = dec.decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)).trim();
  if (!raw) return;

  if (raw === "SCANNING") {
    $("scanState").textContent = "Recherche des réseaux Wi-Fi…";
    return;
  }

  if (raw.startsWith("WIFI|")) {
    const parts = raw.split("|");
    const signal = Number(parts[1] || 0);
    const ssid = parts.slice(2).join("|");
    if (ssid) {
      networks.set(ssid, {ssid, signal});
      renderNetworks();
    }
    return;
  }

  if (raw.startsWith("SCAN_DONE|")) {
    $("rescanBtn").disabled = false;
    $("scanState").textContent = networks.size
      ? "Choisissez le Wi-Fi de l’établissement."
      : "Aucun réseau trouvé.";
    return;
  }

  if (raw === "CONNECTING") {
    $("wifiConnectBtn").disabled = true;
    $("wifiConnectBtn").textContent = "CONNEXION…";
    return;
  }

  if (raw.startsWith("CONNECTED|")) {
    const parts = raw.split("|");
    selectedSsid = parts[1] || selectedSsid;
    connectedIp = parts[2] || "";
    $("successText").textContent = connectedIp
      ? `${selectedSsid} · ${connectedIp}`
      : selectedSsid;
    showOnly("successCard");
    return;
  }

  if (raw.startsWith("ERROR|")) {
    const code = raw.slice("ERROR|".length);
    $("wifiConnectBtn").disabled = false;
    $("wifiConnectBtn").textContent = "CONNECTER MON HUB";
    $("scanState").textContent = errorMessage(code);
    return;
  }
}

function renderNetworks() {
  const target = $("networks");
  target.innerHTML = "";
  [...networks.values()]
    .sort((a,b) => b.signal - a.signal)
    .forEach(n => {
      const label = document.createElement("label");
      label.className = "network" + (selectedSsid === n.ssid ? " selected" : "");
      label.innerHTML = `
        <input type="radio" name="wifi" value="">
        <div>
          <strong></strong>
          <small></small>
        </div>`;
      label.querySelector("strong").textContent = n.ssid;
      label.querySelector("small").textContent = `${n.signal}%`;
      label.querySelector("input").checked = selectedSsid === n.ssid;
      label.querySelector("input").addEventListener("change", () => {
        selectedSsid = n.ssid;
        $("wifiConnectBtn").disabled = !$("password").value;
        renderNetworks();
      });
      target.appendChild(label);
    });
}

async function connectWifi() {
  const pwd = $("password").value;
  if (!selectedSsid || !pwd) return;

  $("wifiConnectBtn").disabled = true;
  $("wifiConnectBtn").textContent = "ENVOI…";

  try {
    await writeText(ssidChar, selectedSsid);
    await writeText(passwordChar, pwd);
    $("password").value = "";
    await writeText(commandChar, "connect");
  } catch (err) {
    $("wifiConnectBtn").disabled = false;
    $("wifiConnectBtn").textContent = "CONNECTER MON HUB";
    $("scanState").textContent = err?.message || String(err);
  }
}

$("connectBtn").addEventListener("click", connectBluetooth);
$("rescanBtn").addEventListener("click", scanWifi);
$("wifiConnectBtn").addEventListener("click", connectWifi);
$("password").addEventListener("input", () => {
  $("wifiConnectBtn").disabled = !(selectedSsid && $("password").value);
});
$("retryBtn").addEventListener("click", () => location.reload());

$("framingBtn").addEventListener("click", () => {
  if (connectedIp) location.href = `http://${connectedIp}:8088/framing`;
});
$("galleryBtn").addEventListener("click", () => {
  if (connectedIp) location.href = `http://${connectedIp}:8090`;
});

// Token lu depuis le QR mais pas encore envoyé au Hub : la vérification côté Hub
// sera ajoutée après validation du prototype fonctionnel.
console.log("PEZPO setup loaded", { hub: expectedHubId, ble: expectedBleName, tokenPresent: !!setupToken });
