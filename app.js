/* ─────────────────────────────────────────
   CONFIGURATION
───────────────────────────────────────── */
const API_URL = "http://172.31.98.135/data";
const POLL_INTERVAL = 2000;

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let isConnected = false;
let totalReads = 0;
let successReads = 0;
let uptimeStart = null;
let uptimeInterval = null;
let alertCooldowns = {};
const ALERT_COOLDOWN = 20000;

/* ─────────────────────────────────────────
   CLOCK
───────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('date').textContent =
    now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}
updateClock();
setInterval(updateClock, 1000);

/* ─────────────────────────────────────────
   ECG CANVAS
───────────────────────────────────────── */
const ecgCanvas = document.getElementById('ecg-canvas');
const ctx = ecgCanvas.getContext('2d');
let ecgPhase = 0;
let ecgConnected = false;

function resizeECG() {
  const wrapper = ecgCanvas.parentElement;
  ecgCanvas.width  = wrapper.clientWidth * window.devicePixelRatio;
  ecgCanvas.height = wrapper.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
resizeECG();
window.addEventListener('resize', resizeECG);

function getECGY(x, w, h, phase) {
  const cx = (x / w + phase) % 1.0;
  const cy = h / 2;
  const p = 0.15 * Math.exp(-Math.pow((cx - 0.15) / 0.04, 2));
  const q = -0.10 * Math.exp(-Math.pow((cx - 0.30) / 0.015, 2));
  const r =  1.00 * Math.exp(-Math.pow((cx - 0.33) / 0.012, 2));
  const s = -0.12 * Math.exp(-Math.pow((cx - 0.37) / 0.015, 2));
  const tWave = 0.35 * Math.exp(-Math.pow((cx - 0.55) / 0.06, 2));
  return cy - (p + q + r + s + tWave) * (h * 0.52);
}

function drawECG() {
  const w = ecgCanvas.width / window.devicePixelRatio;
  const h = ecgCanvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (!ecgConnected) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 2;
    const mid = h / 2;
    ctx.moveTo(0, mid);
    for (let x = 1; x < w; x++) {
      ctx.lineTo(x, mid + (Math.random() - 0.5) * 1.5);
    }
    ctx.stroke();
  } else {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   'rgba(43,191,176,0.0)');
    grad.addColorStop(0.3, 'rgba(43,191,176,1.0)');
    grad.addColorStop(0.7, 'rgba(43,191,176,1.0)');
    grad.addColorStop(1,   'rgba(43,191,176,0.0)');

    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(43,191,176,0.9)';
    ctx.shadowBlur = 12;

    ctx.moveTo(0, getECGY(0, w, h, ecgPhase));
    for (let x = 1; x < w; x++) {
      ctx.lineTo(x, getECGY(x, w, h, ecgPhase));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Moving scan line (bright head)
    const scanX = ((ecgPhase * w)) % w;
    const scanY = getECGY(scanX, w, h, ecgPhase);
    const radGrad = ctx.createRadialGradient(scanX, scanY, 0, scanX, scanY, 20);
    radGrad.addColorStop(0,   'rgba(120,255,240,0.9)');
    radGrad.addColorStop(1,   'rgba(43,191,176,0)');
    ctx.beginPath();
    ctx.fillStyle = radGrad;
    ctx.arc(scanX, scanY, 20, 0, Math.PI * 2);
    ctx.fill();

    ecgPhase += 0.004;
    if (ecgPhase > 1) ecgPhase -= 1;
  }

  requestAnimationFrame(drawECG);
}
drawECG();

/* ─────────────────────────────────────────
   SET CONNECTION STATE
───────────────────────────────────────── */
function setConnected(status) {
  const was = isConnected;
  isConnected = status;
  ecgConnected = status;

  const dot   = document.getElementById('ecg-dot');
  const badge = document.getElementById('ecg-badge');
  const sysVal = document.getElementById('sys-conn-val');
  const bar   = document.getElementById('conn-bar');
  const pct   = document.getElementById('conn-pct');

  if (status) {
    dot.classList.remove('offline');
    badge.classList.remove('offline');
    badge.textContent = 'Connected';
    sysVal.textContent = 'Online';
    bar.style.width = '100%';
    pct.textContent = '100%';

    if (!was && !uptimeStart) {
      uptimeStart = Date.now();
      uptimeInterval = setInterval(updateUptime, 1000);
    }
  } else {
    dot.classList.add('offline');
    badge.classList.add('offline');
    badge.textContent = 'Disconnected';
    sysVal.textContent = 'Offline';
    bar.style.width = '0%';
    pct.textContent = '0%';
  }
}

/* ─────────────────────────────────────────
   UPTIME
───────────────────────────────────────── */
function updateUptime() {
  if (!uptimeStart) return;
  const s = Math.floor((Date.now() - uptimeStart) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  let str = '';
  if (h > 0) str += h + 'h ';
  if (m > 0 || h > 0) str += m + 'm ';
  str += sec + 's';
  document.getElementById('sys-uptime').textContent = str;
}

/* ─────────────────────────────────────────
   TOAST ALERTS
───────────────────────────────────────── */
function showAlert(id, icon, title, msg) {
  const now = Date.now();
  if (alertCooldowns[id] && now - alertCooldowns[id] < ALERT_COOLDOWN) return;
  alertCooldowns[id] = now;

  const container = document.getElementById('alert-container');
  const toast = document.createElement('div');
  toast.className = 'alert-toast';
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">✕</button>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);

  setTimeout(() => dismissToast(toast), 5000);
}

function dismissToast(el) {
  if (!el || !el.parentElement) return;
  el.classList.add('fade-out');
  setTimeout(() => el.remove(), 350);
}

/* ─────────────────────────────────────────
   FLASH ANIMATION ON UPDATE
───────────────────────────────────────── */
function flashUpdate(el) {
  el.classList.remove('value-updating');
  void el.offsetWidth;
  el.classList.add('value-updating');
}

/* ─────────────────────────────────────────
   TEMPERATURE ARC
───────────────────────────────────────── */
function updateTempArc(temp) {
  const pct = Math.max(0, Math.min(1, (temp - 30) / 10));
  const arcLen = 188.5;
  const filled = pct * arcLen;
  document.getElementById('arc-fill').setAttribute('stroke-dasharray', `${filled} ${arcLen}`);

  const angle = Math.PI + pct * Math.PI;
  const cx = 70 + 60 * Math.cos(angle);
  const cy = 74 + 60 * Math.sin(angle);
  const needle = document.getElementById('arc-needle');
  needle.setAttribute('cx', cx);
  needle.setAttribute('cy', cy);
  needle.setAttribute('opacity', '1');
}
const presenceCard = document.querySelector('.card-presence');

if (present) {

orb.className = 'presence-orb';
presenceCard.classList.remove("alert");

presLbl.textContent = "Baby Detected";

} else {

orb.className = 'presence-orb absent alert';
presenceCard.classList.add("alert");

presLbl.textContent = "No Baby Detected";

}
/* ─────────────────────────────────────────
   RENDER DATA
───────────────────────────────────────── */
function renderData(d) {
  // ── Moisture
  const moisture = Math.max(0, Math.min(100, d.soilMoisture));
  const moistEl = document.getElementById('moisture-val');
  moistEl.innerHTML = `${moisture}<sup>%</sup>`;
  flashUpdate(moistEl);
  document.getElementById('diaper-fill').style.width = moisture + '%';

  const chip   = document.getElementById('soil-chip');
  const soilLbl = document.getElementById('soil-label');
  const soilIco = document.getElementById('soil-icon');
  const status = (d.soilStatus || '').toUpperCase();
  chip.className = 'status-chip';
  if (status === 'DRY')   { chip.classList.add('dry');   soilIco.textContent = '🌿'; soilLbl.textContent = 'Dry';   }
  if (status === 'MOIST') { chip.classList.add('moist'); soilIco.textContent = '💧'; soilLbl.textContent = 'Moist'; }
  if (status === 'WET')   { chip.classList.add('wet');   soilIco.textContent = '🌊'; soilLbl.textContent = 'Wet';   }

  // ── Temperature
  const temp = parseFloat(d.temperature);
  const tempEl = document.getElementById('temp-val');
  tempEl.innerHTML = `${temp.toFixed(1)}<sup>°C</sup>`;
  flashUpdate(tempEl);
  updateTempArc(temp);
  const warnEl = document.getElementById('temp-warn');
  if (temp > 35) { warnEl.classList.add('show'); }
  else           { warnEl.classList.remove('show'); }

  // ── Presence
  const orb     = document.getElementById('presence-orb');
  const presLbl = document.getElementById('presence-label');
  const ring1   = document.getElementById('ring-1');
  const ring2   = document.getElementById('ring-2');
  const present = 
      d.ir1 === "OBJECT DETECTED" &&
      d.ir2 === "OBJECT DETECTED";

  if (present) {
    orb.className = 'presence-orb';
    presLbl.textContent = 'Baby Detected';
    presLbl.style.color = '#7ffff4';
    ring1.style.animationPlayState = 'running';
    ring2.style.animationPlayState = 'running';
    ring1.style.opacity = '';
    ring2.style.opacity = '';
  } else {
    orb.className = 'presence-orb absent';
    presLbl.textContent = 'Not Detected';
    presLbl.style.color = 'rgba(255,255,255,0.4)';
    ring1.style.opacity = '0';
    ring2.style.opacity = '0';
  }

  // ── Alerts
  if (moisture > 25) {
    showAlert('diaper', '💧', 'Diaper Change Needed', `Wetness at ${moisture}% — time for a change.`);
  }
  if (temp > 35) {
    showAlert('temp', '🌡️', 'Temperature High', `Reading ${temp.toFixed(1)}°C — please check on baby.`);
  }
  if (!present) {
    showAlert('presence', '🐣', 'Baby Not Detected', 'Baby is not detected in the crib.');
  }

  // ── Last update
  const now = new Date();
  document.getElementById('last-update-label').textContent =
    'Last update: ' + now.toLocaleTimeString('en-US', { hour12: false });
}

/* ─────────────────────────────────────────
   FETCH LOOP
───────────────────────────────────────── */
async function fetchData() {
  totalReads++;
  try {
    const resp = await fetch(API_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    successReads++;
    setConnected(true);
    renderData(data);
  } catch (e) {
    setConnected(false);
  }

  document.getElementById('sys-reads').textContent = totalReads;
}

fetchData();
setInterval(fetchData, POLL_INTERVAL);