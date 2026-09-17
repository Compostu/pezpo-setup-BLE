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

let device;
let server;
let service;
let ssidChar;
let passwordChar;
let commandChar;
let statusChar;

let selectedSsid = "";
let connectedSsid = "";
let connectedIp = "";

const networks = new Map();

function showOnly(id) {
  ["startCard", "wifiCard", "successCard", "errorCard"]
    .forEach(x => $(x).classList.add("hidden"));

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
    FORGET_FAILED: "Impossible d’oublier le réseau Wi-Fi.",
    PASSWORD_ENCODING: "Le mot de passe contient des caractères non pris en charge.",
    INTERNAL: "Erreur interne du Hub."
  };

  return map[code] || `Erreur du Hub : ${code}`;
}

function fail(message) {
  $("errorText").textContent = message;
  showOnly("errorCard");
}

function updateSuccessCard() {
  if (connectedIp) {
    $("successText").textContent = `${connectedSsid} · ${connectedIp}`;
  } else {
    $("successText").textContent = connectedSsid || "Connexion Wi-Fi enregistrée";
  }
}

function updateBackButton() {
  const canGoBack = !!(connectedIp || connectedSsid);
  $("backToSuccessBtn").classList.toggle("hidden", !canGoBack);
}

async function connectBluetooth() {
  if (!webBluetoothAvailable()) {
    fail(
      "Ce navigateur ne prend pas en charge Web Bluetooth. " +
      "Sur Android, ouvrez cette page avec Chrome."
    );
    return;
  }

  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "RECHERCHE…";

  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: expectedBleName },
        { services: [UUID.service] }
      ],
      optionalServices: [UUID.service]
    });

    device.addEventListener("gattserverdisconnected", () => {
      if (!connectedIp && !connectedSsid) {
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
    statusChar.addEventListener(
      "characteristicvaluechanged",
      handleStatus
    );

    showOnly("wifiCard");
    updateBackButton();
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
  $("wifiConnectBtn").textContent = "CONNECTER MON HUB";
  $("networks").innerHTML = "";
  $("scanState").textContent = "Recherche des réseaux Wi-Fi…";
  $("rescanBtn").disabled = true;

  updateBackButton();

  try {
    await writeText(commandChar, "scan");
  } catch (err) {
    $("rescanBtn").disabled = false;
    fail(
      "Impossible de lancer la recherche Wi-Fi : " +
      (err?.message || err)
    );
  }
}

function handleStatus(event) {
  const view = event.target.value;

  const raw = dec.decode(
    view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    )
  ).trim();

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
      networks.set(ssid, { ssid, signal });
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
    $("scanState").textContent = "Connexion du Hub au Wi-Fi…";
    return;
  }

  if (raw.startsWith("CONNECTED|")) {
    const parts = raw.split("|");

    connectedSsid = parts[1] || selectedSsid;
    connectedIp = parts[2] || "";

    selectedSsid = connectedSsid;

    updateSuccessCard();
    updateBackButton();
    showOnly("successCard");

    return;
  }

  if (raw === "FORGETTING") {
    $("forgetWifiBtn").disabled = true;
    $("forgetWifiBtn").textContent = "SUPPRESSION…";
    return;
  }

  if (raw === "WIFI_FORGOTTEN") {
    connectedIp = "";
    connectedSsid = "";
    selectedSsid = "";

    $("password").value = "";
    $("forgetWifiBtn").disabled = false;
    $("forgetWifiBtn").textContent = "OUBLIER CE WI-FI";

    showOnly("wifiCard");
    updateBackButton();
    scanWifi();

    return;
  }

  if (raw === "BUSY") {
    $("scanState").textContent =
      "Le Hub termine une opération. Patientez quelques secondes.";
    return;
  }

  if (raw.startsWith("ERROR|")) {
    const code = raw.slice("ERROR|".length);

    $("wifiConnectBtn").disabled = false;
    $("wifiConnectBtn").textContent = "CONNECTER MON HUB";

    if (!$("forgetWifiBtn").classList.contains("hidden")) {
      $("forgetWifiBtn").disabled = false;
      $("forgetWifiBtn").textContent = "OUBLIER CE WI-FI";
    }

    $("scanState").textContent = errorMessage(code);

    if (
      code === "BAD_PASSWORD" ||
      code === "CONNECTION_FAILED" ||
      code === "SSID_MISSING"
    ) {
      showOnly("wifiCard");
      updateBackButton();
    }

    return;
  }
}

function renderNetworks() {
  const target = $("networks");
  target.innerHTML = "";

  [...networks.values()]
    .sort((a, b) => b.signal - a.signal)
    .forEach(n => {
      const label = document.createElement("label");

      label.className =
        "network" +
        (selectedSsid === n.ssid ? " selected" : "");

      label.innerHTML = `
        <input type="radio" name="wifi" value="">
        <div>
          <strong></strong>
          <small></small>
        </div>
      `;

      label.querySelector("strong").textContent = n.ssid;
      label.querySelector("small").textContent = `${n.signal}%`;

      const input = label.querySelector("input");
      input.checked = selectedSsid === n.ssid;

      input.addEventListener("change", () => {
        selectedSsid = n.ssid;

        $("wifiConnectBtn").disabled =
          !(selectedSsid && $("password").value);

        renderNetworks();
      });

      target.appendChild(label);
    });
}

async function connectWifi() {
  const pwd = $("password").value;

  if (!selectedSsid || !pwd) {
    return;
  }

  $("wifiConnectBtn").disabled = true;
  $("wifiConnectBtn").textContent = "ENVOI…";

  try {
    await writeText(ssidChar, selectedSsid);
    await writeText(passwordChar, pwd);

    // Ne pas conserver le mot de passe dans la page.
    $("password").value = "";

    await writeText(commandChar, "connect");

  } catch (err) {
    $("wifiConnectBtn").disabled = false;
    $("wifiConnectBtn").textContent = "CONNECTER MON HUB";

    $("scanState").textContent =
      err?.message || String(err);
  }
}

$("connectBtn").addEventListener(
  "click",
  connectBluetooth
);

$("rescanBtn").addEventListener(
  "click",
  scanWifi
);

$("wifiConnectBtn").addEventListener(
  "click",
  connectWifi
);

$("password").addEventListener("input", () => {
  $("wifiConnectBtn").disabled =
    !(selectedSsid && $("password").value);
});

$("retryBtn").addEventListener(
  "click",
  () => location.reload()
);

$("changeWifiBtn").addEventListener(
  "click",
  async () => {
    selectedSsid = "";
    $("password").value = "";

    showOnly("wifiCard");
    updateBackButton();

    await scanWifi();
  }
);

$("backToSuccessBtn").addEventListener(
  "click",
  () => {
    if (!connectedSsid && !connectedIp) return;

    updateSuccessCard();
    showOnly("successCard");
  }
);

$("forgetWifiBtn").addEventListener(
  "click",
  async () => {
    const label = connectedSsid
      ? ` « ${connectedSsid} »`
      : "";

    const confirmed = confirm(
      `Oublier le Wi-Fi${label} enregistré sur ce Hub ?`
    );

    if (!confirmed) {
      return;
    }

    $("forgetWifiBtn").disabled = true;
    $("forgetWifiBtn").textContent = "SUPPRESSION…";

    try {
      await writeText(
        commandChar,
        "forget"
      );

    } catch (err) {
      $("forgetWifiBtn").disabled = false;
      $("forgetWifiBtn").textContent = "OUBLIER CE WI-FI";

      fail(
        "Impossible d’oublier le Wi-Fi : " +
        (err?.message || err)
      );
    }
  }
);

$("framingBtn").addEventListener(
  "click",
  () => {
    if (!connectedIp) {
      fail(
        "Adresse du Hub indisponible. " +
        "Reconnectez le Hub au Wi-Fi puis réessayez."
      );
      return;
    }

    window.open(
      `http://${connectedIp}:8088/framing`,
      "_blank",
      "noopener"
    );
  }
);

$("galleryBtn").addEventListener(
  "click",
  () => {
    if (!connectedIp) {
      fail(
        "Adresse du Hub indisponible. " +
        "Reconnectez le Hub au Wi-Fi puis réessayez."
      );
      return;
    }

    window.open(
      `http://${connectedIp}:8090/`,
      "_blank",
      "noopener"
    );
  }
);

console.log(
  "PEZPO setup loaded",
  {
    hub: expectedHubId,
    ble: expectedBleName,
    tokenPresent: !!setupToken
  }
);
