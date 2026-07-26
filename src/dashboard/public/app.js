// ═══════════════════════════════════════════════════════════════
// 🌐 Dashboard Client JS — WiFi Guard Bot
// Real-time device monitoring with Socket.IO
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let socket = null;
let devices = [];
let showAll = false;
let activityLog = [];
const MAX_ACTIVITY = 50;

// ─────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  updateTime();
  setInterval(updateTime, 1000);
});

// ─────────────────────────────────────────
// Socket.IO Connection
// ─────────────────────────────────────────
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    updateStatus(true);
    console.log('✅ Connected to WiFi Guard');
  });

  socket.on('disconnect', () => {
    updateStatus(false);
  });

  // Initial data
  socket.on('init', (data) => {
    if (data.devices) {
      devices = data.devices;
      renderDeviceTable(devices);
    }
    if (data.stats) {
      updateStats(data.stats);
    }
    if (data.system) {
      updateSystemInfo(data.system);
    }
  });

  // Scan updates
  socket.on('scan_update', (data) => {
    if (data.onlineDevices) {
      devices = data.onlineDevices;
      renderDeviceTable(showAll ? null : devices);
    }
    if (data.stats) {
      updateStats(data.stats);
    }
  });

  // New device detected
  socket.on('new_device', (device) => {
    showToast('alert', '🚨 Perangkat Baru!', `${device.icon || '❓'} ${device.vendor || 'Unknown'} (${device.ip})`);
    addActivity('new', device);
  });

  // Device disconnected
  socket.on('device_disconnect', (device) => {
    addActivity('disconnect', device);
  });

  // Device reconnected
  socket.on('device_reconnect', (device) => {
    addActivity('reconnect', device);
  });
}

// ─────────────────────────────────────────
// Render Device Table
// ─────────────────────────────────────────
function renderDeviceTable(deviceList) {
  const tbody = document.getElementById('device-tbody');
  
  if (!deviceList) {
    // Fetch all devices
    fetch('/api/devices/all')
      .then(r => r.json())
      .then(data => {
        if (data.success) renderDeviceTable(data.devices);
      });
    return;
  }

  if (deviceList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-dim);">
          <div style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;">📡</div>
          <p>Belum ada perangkat terdeteksi</p>
          <p style="font-size: 0.78rem; margin-top: 4px;">Menunggu hasil scan...</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = deviceList.map((d, i) => {
    const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
    const trustClass = `trust-${d.trust_level || 'unknown'}`;
    const trustLabel = (d.trust_level || 'unknown').toUpperCase();
    const trustIcon = { trusted: '✅', known: '🟡', unknown: '🔴', blocked: '🚫', suspicious: '⚠️' }[d.trust_level] || '❓';
    const isOnline = d.is_online ? '🟢' : '🔴';
    const lastSeen = d.last_seen ? formatTimeShort(d.last_seen) : '—';
    
    return `
      <tr class="${d.is_new ? 'new-device' : ''}">
        <td style="color: var(--text-dim); font-family: var(--font-mono); font-size: 0.75rem;">${i + 1}</td>
        <td>
          <div class="device-name">
            <span class="device-icon">${d.device_icon || '❓'}</span>
            <div>
              <div class="name-text">${escapeHtml(name)}</div>
              ${d.hostname && d.custom_name ? `<div class="hostname">${escapeHtml(d.hostname)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="mono">${d.ip || '—'}</span></td>
        <td><span class="mac-addr">${d.mac}</span></td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(d.vendor || d.nmap_vendor || 'Unknown')}</td>
        <td>
          <span style="font-size: 0.82rem;">${d.device_icon || ''} ${d.device_label || d.device_type || 'Unknown'}</span>
        </td>
        <td>
          <span class="trust-badge ${trustClass}">${trustIcon} ${trustLabel}</span>
        </td>
        <td style="font-size: 0.78rem; color: var(--text-dim); font-family: var(--font-mono);">
          ${isOnline} ${lastSeen}
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            ${d.trust_level !== 'trusted' 
              ? `<button class="btn btn-ghost btn-sm btn-trust" onclick="trustDevice('${d.mac}')">Trust</button>` 
              : ''}
            ${d.trust_level !== 'blocked' 
              ? `<button class="btn btn-ghost btn-sm btn-block" onclick="blockDevice('${d.mac}')">Block</button>` 
              : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────
// Update Stats
// ─────────────────────────────────────────
function updateStats(stats) {
  animateValue('stat-online-value', stats.onlineDevices);
  animateValue('stat-total-value', stats.totalDevices);
  animateValue('stat-trusted-value', stats.trustedDevices);
  animateValue('stat-unknown-value', stats.unknownDevices);
  animateValue('stat-today-value', stats.todayNewDevices);
  animateValue('stat-connections-value', stats.todayConnections);
}

function animateValue(elementId, newValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const oldValue = parseInt(el.textContent) || 0;
  if (oldValue === newValue) return;

  // Quick animation
  const diff = newValue - oldValue;
  const steps = Math.min(Math.abs(diff), 20);
  const stepValue = diff / steps;
  let current = oldValue;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    current += stepValue;
    el.textContent = Math.round(current);
    
    if (step >= steps) {
      clearInterval(interval);
      el.textContent = newValue;
    }
  }, 30);
}

// ─────────────────────────────────────────
// Update System Info
// ─────────────────────────────────────────
function updateSystemInfo(info) {
  const ifaceEl = document.getElementById('sys-interface');
  const ipEl = document.getElementById('sys-ip');
  if (ifaceEl) ifaceEl.textContent = info.interface || '—';
  if (ipEl) ipEl.textContent = info.localIP || '—';
}

// ─────────────────────────────────────────
// Update Connection Status
// ─────────────────────────────────────────
function updateStatus(isConnected) {
  const badge = document.getElementById('status-badge');
  const text = badge.querySelector('.status-text');
  
  if (isConnected) {
    badge.classList.remove('offline');
    text.textContent = 'Connected';
  } else {
    badge.classList.add('offline');
    text.textContent = 'Disconnected';
  }
}

// ─────────────────────────────────────────
// Activity Log
// ─────────────────────────────────────────
function addActivity(type, device) {
  const icons = { new: '🚨', disconnect: '📴', reconnect: '🔄', scan: '🔍' };
  const texts = {
    new: `Perangkat baru: <strong>${escapeHtml(device.vendor || device.mac)}</strong> (${device.ip})`,
    disconnect: `Disconnected: <strong>${escapeHtml(device.custom_name || device.hostname || device.vendor || device.mac)}</strong>`,
    reconnect: `Reconnected: <strong>${escapeHtml(device.custom_name || device.hostname || device.vendor || device.mac)}</strong> (${device.ip})`,
  };

  const item = {
    type,
    icon: icons[type] || '📡',
    text: texts[type] || 'Unknown event',
    time: new Date(),
  };

  activityLog.unshift(item);
  if (activityLog.length > MAX_ACTIVITY) activityLog.pop();

  renderActivityLog();
  updateActivityCount();
}

function renderActivityLog() {
  const list = document.getElementById('activity-list');
  
  if (activityLog.length === 0) {
    list.innerHTML = `
      <div class="activity-empty">
        <span>🔍</span>
        <p>Menunggu aktivitas jaringan...</p>
      </div>
    `;
    return;
  }

  list.innerHTML = activityLog.map(item => `
    <div class="activity-item">
      <span class="activity-icon">${item.icon}</span>
      <div class="activity-content">
        <div class="activity-text">${item.text}</div>
        <div class="activity-time">${formatTimeShort(item.time)}</div>
      </div>
    </div>
  `).join('');
}

function updateActivityCount() {
  const badge = document.getElementById('activity-count');
  if (badge) badge.textContent = activityLog.length;
}

// ─────────────────────────────────────────
// Toast Notifications
// ─────────────────────────────────────────
function showToast(type, title, message, duration = 5000) {
  const container = document.getElementById('toast-container');
  const icons = { alert: '🚨', success: '✅', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '📢'}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────
function toggleShowAll() {
  showAll = !showAll;
  const btn = document.getElementById('btn-show-all');
  
  if (showAll) {
    btn.textContent = 'Online Only';
    btn.classList.add('active');
    renderDeviceTable(null); // Fetch all from API
  } else {
    btn.textContent = 'Show All';
    btn.classList.remove('active');
    renderDeviceTable(devices);
  }
}

function refreshDevices() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon" style="display:inline-block;animation:spin 0.8s linear infinite;">🔄</span> Scanning...';

  fetch('/api/devices' + (showAll ? '/all' : ''))
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        if (!showAll) devices = data.devices;
        renderDeviceTable(data.devices);
        showToast('success', 'Scan Complete', `${data.count} perangkat ditemukan`);
      }
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">🔄</span> Refresh';
    });

  fetch('/api/stats')
    .then(r => r.json())
    .then(data => {
      if (data.success) updateStats(data.stats);
    });
}

function trustDevice(mac) {
  fetch(`/api/devices/${encodeURIComponent(mac)}/trust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'trusted' })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showToast('success', 'Trusted!', `Device ${mac} ditandai sebagai trusted`);
        refreshDevices();
      }
    });
}

function blockDevice(mac) {
  fetch(`/api/devices/${encodeURIComponent(mac)}/trust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'blocked' })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showToast('alert', 'Blocked!', `Device ${mac} ditandai sebagai blocked`);
        refreshDevices();
      }
    });
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────
function formatTimeShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
}

function updateTime() {
  const el = document.getElementById('footer-time');
  if (el) {
    el.textContent = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
