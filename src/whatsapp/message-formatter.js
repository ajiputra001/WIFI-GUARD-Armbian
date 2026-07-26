// ═══════════════════════════════════════════════════════════════
// 🎨 Message Formatter — WiFi Guard Bot
// Format pesan WhatsApp yang keren dan informatif
// ═══════════════════════════════════════════════════════════════

class MessageFormatter {
  constructor() {
    this.divider = '━━━━━━━━━━━━━━━━━━━━━━━━━';
    this.thinDivider = '─────────────────────────';
  }

  // ─────────────────────────────────────────
  // Format timestamp ke WIB
  // ─────────────────────────────────────────
  _formatTime(date) {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
  }

  _formatTimeShort(date) {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit', minute: '2-digit',
      hour12: false
    });
  }

  // ─────────────────────────────────────────
  // 🚨 Alert: New unknown device connected
  // ─────────────────────────────────────────
  formatNewDeviceAlert(device, totalOnline) {
    const threatEmoji = device.threatLevel === 'unknown' ? '🔴' : '🟡';
    const threatLabel = (device.threatLevel || 'UNKNOWN').toUpperCase();
    
    return [
      '🚨 *WIFI GUARD ALERT* 🚨 _(by AJIPUTRA-TECH)_',
      this.divider,
      '',
      '⚠️ *PERANGKAT BARU TERDETEKSI!*',
      '',
      `${device.icon || '❓'} *Device Info:*`,
      `├─ IP: \`${device.ip}\``,
      `├─ MAC: \`${device.mac}\``,
      `├─ Vendor: ${device.vendor || 'Unknown'}`,
      `├─ Type: ${device.icon || '❓'} ${device.label || 'Unknown'}`,
      device.hostname ? `├─ Hostname: ${device.hostname}` : null,
      device.os ? `├─ OS: ${device.os}` : null,
      `└─ Name: ${device.customName || '_Belum diberi nama_'}`,
      '',
      `🔒 *Threat Level:* ${threatLabel} ${threatEmoji}`,
      `⏰ *Waktu:* ${this._formatTime()}`,
      '',
      `📊 Total perangkat online: *${totalOnline}*`,
      this.divider,
      '💡 _Reply !trust <MAC> untuk trust_',
      '💡 _Reply !help untuk semua perintah_',
    ].filter(Boolean).join('\n');
  }

  // ─────────────────────────────────────────
  // 🟢 Alert: Known device reconnected
  // ─────────────────────────────────────────
  formatReconnectAlert(device, totalOnline) {
    return [
      '🔄 *DEVICE RECONNECTED*',
      this.thinDivider,
      '',
      `${device.icon || '❓'} ${device.customName || device.hostname || device.vendor || device.mac}`,
      `├─ IP: \`${device.ip}\``,
      `├─ MAC: \`${device.mac}\``,
      `└─ Status: 🟢 Online`,
      '',
      `⏰ ${this._formatTime()}`,
      `📊 Online: *${totalOnline}* perangkat`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 📴 Alert: Device disconnected
  // ─────────────────────────────────────────
  formatDisconnectAlert(device, totalOnline) {
    return [
      '📴 *DEVICE DISCONNECTED*',
      this.thinDivider,
      '',
      `${device.device_icon || '❓'} ${device.custom_name || device.hostname || device.vendor || device.mac}`,
      `├─ IP: \`${device.ip}\``,
      `├─ MAC: \`${device.mac}\``,
      `└─ Status: 🔴 Offline`,
      '',
      `⏰ ${this._formatTime()}`,
      `📊 Online: *${totalOnline}* perangkat`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // ⚠️ Alert: Suspicious activity
  // ─────────────────────────────────────────
  formatSuspiciousAlert(device, reason) {
    return [
      '⚠️ *AKTIVITAS MENCURIGAKAN* ⚠️',
      this.divider,
      '',
      `🔴 *${reason}*`,
      '',
      `${device.icon || '❓'} *Device Info:*`,
      `├─ IP: \`${device.ip}\``,
      `├─ MAC: \`${device.mac}\``,
      `├─ Vendor: ${device.vendor || 'Unknown'}`,
      `└─ Type: ${device.label || 'Unknown'}`,
      '',
      `⏰ ${this._formatTime()}`,
      this.divider,
      '🛡️ _Segera periksa jaringan Anda!_',
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 📊 Status response
  // ─────────────────────────────────────────
  formatStatus(systemInfo, stats) {
    const uptime = this._formatUptime(systemInfo.uptime);
    
    return [
      '🛡️ *WIFI GUARD STATUS*',
      this.divider,
      '',
      '🖥️ *System:*',
      `├─ Host: ${systemInfo.hostname}`,
      `├─ Interface: ${systemInfo.interface}`,
      `├─ Local IP: ${systemInfo.localIP}`,
      `├─ Subnet: ${systemInfo.subnet}`,
      `└─ Uptime: ${uptime}`,
      '',
      '📊 *Network Stats:*',
      `├─ 🟢 Online: *${stats.onlineDevices}* perangkat`,
      `├─ 📋 Total pernah terdeteksi: *${stats.totalDevices}*`,
      `├─ ✅ Trusted: *${stats.trustedDevices}*`,
      `├─ ❓ Unknown: *${stats.unknownDevices}*`,
      `├─ 🚫 Blocked: *${stats.blockedDevices}*`,
      `└─ 🆕 Baru hari ini: *${stats.todayNewDevices}*`,
      '',
      `⏰ ${this._formatTime()}`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 📋 Device list
  // ─────────────────────────────────────────
  formatDeviceList(devices) {
    if (!devices || devices.length === 0) {
      return '📋 *DAFTAR PERANGKAT*\n\n_Tidak ada perangkat online_';
    }

    const lines = [
      '📋 *DAFTAR PERANGKAT ONLINE*',
      this.divider,
      '',
      `Total: *${devices.length}* perangkat`,
      '',
    ];

    devices.forEach((d, i) => {
      const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
      const trustIcon = { trusted: '✅', known: '🟡', unknown: '🔴', blocked: '🚫', suspicious: '⚠️' };
      const ti = trustIcon[d.trust_level] || '❓';
      
      lines.push(
        `*${i + 1}.* ${d.device_icon || '❓'} ${name} ${ti}`,
        `    IP: \`${d.ip}\` | MAC: \`${d.mac}\``,
        ''
      );
    });

    lines.push(`⏰ ${this._formatTime()}`);
    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 📜 History
  // ─────────────────────────────────────────
  formatHistory(logs) {
    if (!logs || logs.length === 0) {
      return '📜 *RIWAYAT 24 JAM*\n\n_Belum ada aktivitas_';
    }

    const lines = [
      '📜 *RIWAYAT 24 JAM TERAKHIR*',
      this.divider,
      '',
    ];

    logs.forEach((log) => {
      const icon = log.event_type === 'connect' ? '🟢' : '🔴';
      const action = log.event_type === 'connect' ? 'Connected' : 'Disconnected';
      const name = log.custom_name || log.hostname || log.vendor || log.mac;
      const time = this._formatTimeShort(log.timestamp);
      
      lines.push(`${icon} \`${time}\` ${log.device_icon || ''} ${name}`);
      lines.push(`    ${action} | IP: \`${log.ip || 'N/A'}\``);
      lines.push('');
    });

    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 📊 Statistics
  // ─────────────────────────────────────────
  formatStats(stats) {
    return [
      '📊 *STATISTIK JARINGAN*',
      this.divider,
      '',
      '📈 *Ringkasan:*',
      `├─ Total perangkat terdaftar: *${stats.totalDevices}*`,
      `├─ Sedang online: *${stats.onlineDevices}*`,
      `├─ Koneksi hari ini: *${stats.todayConnections}*`,
      `├─ Perangkat baru hari ini: *${stats.todayNewDevices}*`,
      `├─ Peak hour (7 hari): *${stats.peakHour}*`,
      `└─ Device terbanyak konek: *${stats.topDevice}*`,
      '',
      '🔒 *Keamanan:*',
      `├─ ✅ Trusted: *${stats.trustedDevices}*`,
      `├─ ❓ Unknown: *${stats.unknownDevices}*`,
      `└─ 🚫 Blocked: *${stats.blockedDevices}*`,
      '',
      `⏰ ${this._formatTime()}`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 📊 Daily Report
  // ─────────────────────────────────────────
  formatDailyReport(stats, onlineDevices, unknownDevices) {
    const lines = [
      '📊 *LAPORAN HARIAN WiFi Guard*',
      this.divider,
      `📅 ${this._formatTime()}`,
      '',
      '📈 *Ringkasan Hari Ini:*',
      `├─ Koneksi masuk: *${stats.todayConnections}*`,
      `├─ Perangkat baru: *${stats.todayNewDevices}*`,
      `├─ Sedang online: *${stats.onlineDevices}*`,
      `└─ Total terdaftar: *${stats.totalDevices}*`,
      '',
    ];

    if (unknownDevices && unknownDevices.length > 0) {
      lines.push('🔴 *Perangkat Unknown:*');
      unknownDevices.forEach((d, i) => {
        const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
        lines.push(`  ${i + 1}. ${d.device_icon || '❓'} ${name} (\`${d.mac}\`)`);
      });
      lines.push('');
    }

    if (onlineDevices && onlineDevices.length > 0) {
      lines.push('🟢 *Perangkat Online:*');
      onlineDevices.forEach((d, i) => {
        const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
        lines.push(`  ${i + 1}. ${d.device_icon || '❓'} ${name}`);
      });
      lines.push('');
    }

    lines.push(this.divider);
    lines.push('🛡️ _WiFi Guard Bot aktif & memantau_');
    
    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 🆘 Help message
  // ─────────────────────────────────────────
  formatHelp() {
    return [
      '🛡️ *WiFi Guard Bot — PERINTAH*',
      this.divider,
      '',
      '📋 *Info & Monitoring:*',
      '├─ `!status` — Status bot & jaringan',
      '├─ `!devices` — Daftar perangkat online',
      '├─ `!scan` — Force scan sekarang',
      '├─ `!history` — Riwayat 24 jam',
      '└─ `!stats` — Statistik lengkap',
      '',
      '🔐 *Keamanan:*',
      '├─ `!trust <MAC>` — Trust perangkat',
      '├─ `!untrust <MAC>` — Untrust perangkat',
      '├─ `!block <MAC>` — Block perangkat',
      '├─ `!name <MAC> <nama>` — Beri nama',
      '├─ `!whitelist` — Daftar trusted',
      '└─ `!unknown` — Daftar unknown',
      '',
      '⚙️ *Pengaturan:*',
      '├─ `!alert on` — Aktifkan alert',
      '├─ `!alert off` — Matikan alert',
      '└─ `!ping` — Test koneksi bot',
      '',
      this.thinDivider,
      '💡 _Contoh: !trust AA:BB:CC:DD:EE:FF_',
      '💡 _Contoh: !name AA:BB:CC:DD:EE:FF HP Aji_',
      '',
      this.divider,
      '⚡ _Powered by *AJIPUTRA-TECH* — Cybersecurity Division_',
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // ✅ Trust/Block confirmation
  // ─────────────────────────────────────────
  formatTrustConfirm(device, action) {
    const actionText = action === 'trusted' ? '✅ TRUSTED' : action === 'blocked' ? '🚫 BLOCKED' : '❓ UNKNOWN';
    const name = device.custom_name || device.hostname || device.vendor || 'Unknown';

    return [
      `${actionText}`,
      this.thinDivider,
      `${device.device_icon || '❓'} ${name}`,
      `MAC: \`${device.mac}\``,
      `Status: ${actionText}`,
      '',
      `⏰ ${this._formatTime()}`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 🏷️ Name set confirmation
  // ─────────────────────────────────────────
  formatNameSet(mac, newName) {
    return [
      '🏷️ *NAMA DIPERBARUI*',
      this.thinDivider,
      `MAC: \`${mac}\``,
      `Nama baru: *${newName}*`,
      '',
      `⏰ ${this._formatTime()}`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 🟢 Bot startup message
  // ─────────────────────────────────────────
  formatStartup(systemInfo) {
    return [
      '🛡️ *WiFi Guard Bot AKTIF* 🛡️',
      this.divider,
      '',
      '✅ Bot berhasil dijalankan!',
      '',
      '🖥️ *System Info:*',
      `├─ Host: ${systemInfo.hostname}`,
      `├─ Interface: ${systemInfo.interface}`,
      `├─ Local IP: ${systemInfo.localIP}`,
      `└─ Subnet: ${systemInfo.subnet}`,
      '',
      '🔍 _Memulai pemantauan jaringan..._',
      '',
      this.thinDivider,
      '💡 _Ketik !help untuk daftar perintah_',
      '',
      this.divider,
      '⚡ _*AJIPUTRA-TECH* — Cybersecurity Division_',
      '🌐 _WiFi Guard Bot v1.0 | Network Defense System_',
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // Utility: Format uptime
  // ─────────────────────────────────────────
  _formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    
    return parts.join(' ');
  }
}

module.exports = MessageFormatter;
