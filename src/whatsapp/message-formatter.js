// ═══════════════════════════════════════════════════════════════
// 🎨 Message Formatter — WiFi Guard Bot v2.0
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
  formatNewDeviceAlert(device, totalOnline, signalInfo = null) {
    const threatEmoji = device.threatLevel === 'unknown' ? '🔴' : '🟡';
    const threatLabel = (device.threatLevel || 'UNKNOWN').toUpperCase();
    
    const lines = [
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
    ];

    // Add signal/location info if available
    if (signalInfo) {
      lines.push('');
      if (signalInfo.rssi !== undefined) {
        const bar = this._getSignalBar(signalInfo.quality);
        lines.push(`📶 *Signal:* ${bar} ${signalInfo.rssi}dBm (${signalInfo.quality}%)`);
      }
      if (signalInfo.zone) {
        lines.push(`📍 *Estimasi Lokasi:* ${signalInfo.zone.emoji} ${signalInfo.zone.label}`);
        lines.push(`    _${signalInfo.zone.description}_`);
      } else if (signalInfo.rtt !== undefined) {
        lines.push(`📡 *Ping RTT:* ${signalInfo.rtt.toFixed(1)}ms`);
        if (signalInfo.zone) {
          lines.push(`📍 *Estimasi:* ${signalInfo.zone.emoji} ${signalInfo.zone.label}`);
        }
      }
    }

    lines.push('');
    lines.push(`⏰ *Waktu:* ${this._formatTime()}`);
    lines.push('');
    lines.push(`📊 Total perangkat online: *${totalOnline}*`);
    lines.push(this.divider);
    lines.push('💡 _Reply /trust <MAC> untuk trust_');
    lines.push('💡 _Reply /blockip <IP> untuk blokir akses_');
    lines.push('💡 _Reply /locate <IP> untuk lacak lokasi_');
    lines.push('💡 _Reply /help untuk semua perintah_');

    return lines.filter(Boolean).join('\n');
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
      '💡 _Gunakan /blockip <IP> untuk blokir_',
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 📊 Status response — ENHANCED v2.0
  // ─────────────────────────────────────────
  formatStatus(systemInfo, stats, onlineDevices = [], signalData = new Map(), blockedIPs = [], scanCount = 0) {
    const uptime = this._formatUptime(systemInfo.uptime);
    const botUptime = this._formatUptime(process.uptime());
    
    const lines = [
      '🛡️ *WIFI GUARD STATUS — v2.0*',
      this.divider,
      '',
      '🖥️ *System:*',
      `├─ Host: ${systemInfo.hostname}`,
      `├─ Interface: ${systemInfo.interface}`,
      `├─ Local IP: ${systemInfo.localIP}`,
      `├─ Subnet: ${systemInfo.subnet}`,
      `├─ System Uptime: ${uptime}`,
      `├─ Bot Uptime: ${botUptime}`,
      `└─ Scan Count: #${scanCount.toLocaleString('id-ID')}`,
      '',
      '📊 *Network Stats:*',
      `├─ 🟢 Online: *${stats.onlineDevices}* perangkat`,
      `├─ 📋 Total pernah terdeteksi: *${stats.totalDevices}*`,
      `├─ ✅ Trusted: *${stats.trustedDevices}*`,
      `├─ ❓ Unknown: *${stats.unknownDevices}*`,
      `├─ 🚫 Blocked: *${stats.blockedDevices}*`,
      `├─ 🔥 Firewall Active: *${blockedIPs.length}* IP diblok`,
      `└─ 🆕 Baru hari ini: *${stats.todayNewDevices}*`,
    ];

    // Add online device list with signal info
    if (onlineDevices && onlineDevices.length > 0) {
      lines.push('');
      lines.push('📱 *PERANGKAT TERHUBUNG:*');
      lines.push(this.divider);

      onlineDevices.forEach((d, i) => {
        const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
        const trustIcon = { trusted: '✅', known: '🟡', unknown: '🔴', blocked: '🚫', suspicious: '⚠️' };
        const ti = trustIcon[d.trust_level] || '❓';
        const blockedTag = d.is_ip_blocked ? ' 🔥' : '';

        lines.push(`*${i + 1}.* ${d.device_icon || '❓'} ${name} ${ti}${blockedTag}`);
        lines.push(`    IP: \`${d.ip}\` | MAC: \`${d.mac}\``);

        // Add signal info if available
        const signal = signalData.get(d.mac);
        if (signal) {
          if (signal.rssi !== undefined) {
            const bar = this._getSignalBar(signal.quality);
            lines.push(`    📶 Signal: ${bar} ${signal.rssi}dBm (${signal.quality}%)`);
          }
          if (signal.zone) {
            const warningTag = signal.zone.level <= 2 && d.trust_level !== 'trusted' ? ' ⚠️' : '';
            lines.push(`    📍 Lokasi: ${signal.zone.emoji} ${signal.zone.label}${warningTag}`);
          }
          if (signal.rtt !== undefined && !signal.rssi) {
            lines.push(`    📡 RTT: ${signal.rtt.toFixed(1)}ms | ${signal.zone ? signal.zone.emoji + ' ' + signal.zone.label : ''}`);
          }
        }

        lines.push('');
      });
    }

    lines.push(`⏰ ${this._formatTime()}`);
    return lines.join('\n');
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
      const blockedTag = d.is_ip_blocked ? ' 🔥BLOCKED' : '';
      
      lines.push(
        `*${i + 1}.* ${d.device_icon || '❓'} ${name} ${ti}${blockedTag}`,
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
    lines.push('💡 _Ketik /help untuk daftar perintah_');
    
    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 🆘 Help message — UPDATED v2.0
  // ─────────────────────────────────────────
  formatHelp() {
    return [
      '🛡️ *WiFi Guard Bot v2.0 — PERINTAH*',
      this.divider,
      '',
      '📋 *Info & Monitoring:*',
      '├─ `/status` — Status lengkap + daftar device',
      '├─ `/devices` — Daftar perangkat online',
      '├─ `/scan` — Force scan sekarang',
      '├─ `/history` — Riwayat 24 jam',
      '└─ `/stats` — Statistik lengkap',
      '',
      '🔐 *Keamanan:*',
      '├─ `/trust <MAC>` — Trust perangkat',
      '├─ `/untrust <MAC>` — Untrust perangkat',
      '├─ `/block <MAC>` — Block perangkat',
      '├─ `/name <MAC> <nama>` — Beri nama',
      '├─ `/whitelist` — Daftar trusted',
      '└─ `/unknown` — Daftar unknown',
      '',
      '🔥 *Firewall (IP Block):*',
      '├─ `/blockip <IP>` — Blokir akses internet',
      '├─ `/unblockip <IP>` — Buka blokir',
      '└─ `/blocked` — Daftar IP yang diblok',
      '',
      '📡 *Pelacakan Lokasi:*',
      '├─ `/locate <MAC/IP>` — Lacak lokasi device',
      '└─ `/radar` — Radar semua device + lokasi',
      '',
      '⚙️ *Pengaturan:*',
      '├─ `/alert on` — Aktifkan alert',
      '├─ `/alert off` — Matikan alert',
      '└─ `/ping` — Test koneksi bot',
      '',
      this.thinDivider,
      '💡 _Contoh: /trust AA:BB:CC:DD:EE:FF_',
      '💡 _Contoh: /blockip 192.168.1.150_',
      '💡 _Contoh: /locate 192.168.1.150_',
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
      '🛡️ *WiFi Guard Bot v2.0 AKTIF* 🛡️',
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
      '🆕 *Fitur Baru v2.0:*',
      '├─ 🔥 Block/Unblock IP via ARP Spoof',
      '├─ 📡 Pelacakan lokasi penyusup',
      '├─ 📶 Signal strength monitoring',
      '└─ 📊 Status detail + device list',
      '',
      '🔍 _Memulai pemantauan jaringan..._',
      '',
      this.thinDivider,
      '💡 _Ketik /help untuk daftar perintah_',
      '',
      this.divider,
      '⚡ _*AJIPUTRA-TECH* — Cybersecurity Division_',
      '🌐 _WiFi Guard Bot v2.0 | Network Defense System_',
    ].join('\n');
  }

  // ═══════════════════════════════════════════
  // NEW v2.0 Formatters
  // ═══════════════════════════════════════════

  // ─────────────────────────────────────────
  // 🔥 Block IP Confirmation
  // ─────────────────────────────────────────
  formatBlockIPConfirm(device, ip, methods = []) {
    const name = device ? (device.custom_name || device.hostname || device.vendor || 'Unknown') : 'Unknown';
    const mac = device ? device.mac : 'N/A';

    return [
      '🔥 *IP BERHASIL DIBLOKIR*',
      this.divider,
      '',
      `${device ? (device.device_icon || '❓') : '❓'} *${name}*`,
      `├─ IP: \`${ip}\``,
      `├─ MAC: \`${mac}\``,
      `├─ Metode: ${methods.join(' + ')}`,
      `└─ Status: 🚫 *BLOCKED*`,
      '',
      '📌 *Detail:*',
      '├─ ✅ ARP Spoof aktif (traffic diarahkan ke void)',
      '├─ ✅ Perangkat kehilangan akses internet',
      '└─ ⚠️ Perangkat masih bisa terlihat di WiFi',
      '',
      `⏰ ${this._formatTime()}`,
      '',
      '💡 _Gunakan /unblockip ' + ip + ' untuk membuka blokir_',
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 🔓 Unblock IP Confirmation
  // ─────────────────────────────────────────
  formatUnblockIPConfirm(device, ip) {
    const name = device ? (device.custom_name || device.hostname || device.vendor || 'Unknown') : 'Unknown';
    const mac = device ? device.mac : 'N/A';

    return [
      '🔓 *BLOKIR IP DIBUKA*',
      this.thinDivider,
      '',
      `${device ? (device.device_icon || '❓') : '❓'} *${name}*`,
      `├─ IP: \`${ip}\``,
      `├─ MAC: \`${mac}\``,
      `└─ Status: ✅ *UNBLOCKED*`,
      '',
      '📌 Perangkat sekarang bisa mengakses internet kembali',
      '',
      `⏰ ${this._formatTime()}`,
    ].join('\n');
  }

  // ─────────────────────────────────────────
  // 🔥 Blocked List
  // ─────────────────────────────────────────
  formatBlockedList(firewallBlocked = [], dbBlocked = []) {
    if (firewallBlocked.length === 0 && dbBlocked.length === 0) {
      return '🔥 *DAFTAR IP DIBLOK*\n\n_Tidak ada IP yang sedang diblok_\n\n💡 _Gunakan /blockip <IP> untuk memblokir_';
    }

    const lines = [
      '🔥 *DAFTAR IP YANG DIBLOKIR*',
      this.divider,
      '',
    ];

    // Active firewall blocks
    if (firewallBlocked.length > 0) {
      lines.push('🟥 *Blokir Aktif (Firewall):*');
      firewallBlocked.forEach((entry, i) => {
        const status = entry.active ? '🔴 ACTIVE' : '⚪ INACTIVE';
        lines.push(`  ${i + 1}. IP: \`${entry.ip}\``);
        lines.push(`     MAC: \`${entry.mac}\` | ${status}`);
        lines.push(`     Metode: ${entry.method}`);
        lines.push('');
      });
    }

    // Database blocked devices (might include historical blocks)
    const additionalDB = dbBlocked.filter(d => !firewallBlocked.some(f => f.ip === d.ip));
    if (additionalDB.length > 0) {
      lines.push('📋 *Riwayat Blokir (Database):*');
      additionalDB.forEach((d, i) => {
        const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
        lines.push(`  ${i + 1}. ${d.device_icon || '❓'} ${name}`);
        lines.push(`     IP: \`${d.ip}\` | MAC: \`${d.mac}\``);
        lines.push('');
      });
    }

    lines.push(`📊 Total: *${firewallBlocked.length}* blokir aktif, *${dbBlocked.length}* di database`);
    lines.push('');
    lines.push(`⏰ ${this._formatTime()}`);
    lines.push('');
    lines.push('💡 _Gunakan /unblockip <IP> untuk membuka blokir_');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 📍 Device Location (single device)
  // ─────────────────────────────────────────
  formatDeviceLocation(device, signalInfo) {
    const name = device.custom_name || device.hostname || device.vendor || 'Unknown';
    const trustIcon = { trusted: '✅', known: '🟡', unknown: '🔴', blocked: '🚫' };
    const ti = trustIcon[device.trust_level] || '❓';

    const lines = [
      '📍 *PELACAKAN LOKASI PERANGKAT*',
      this.divider,
      '',
      `${device.device_icon || '❓'} *${name}* ${ti}`,
      `├─ IP: \`${device.ip}\``,
      `├─ MAC: \`${device.mac}\``,
      `├─ Vendor: ${device.vendor || 'Unknown'}`,
      `└─ Type: ${device.device_label || 'Unknown'}`,
      '',
    ];

    if (signalInfo) {
      lines.push('📡 *Analisis Sinyal:*');

      if (signalInfo.rssi !== undefined) {
        const bar = this._getSignalBar(signalInfo.quality);
        lines.push(`├─ 📶 RSSI: *${signalInfo.rssi} dBm*`);
        lines.push(`├─ 📊 Kualitas: ${bar} *${signalInfo.quality}%*`);
        if (signalInfo.distance) {
          lines.push(`├─ 📏 Estimasi Jarak: *~${signalInfo.distance}m*`);
        }
        if (signalInfo.txBitrate) {
          lines.push(`├─ ⬆️ TX Bitrate: ${signalInfo.txBitrate} Mbps`);
        }
        if (signalInfo.rxBitrate) {
          lines.push(`├─ ⬇️ RX Bitrate: ${signalInfo.rxBitrate} Mbps`);
        }
      } else if (signalInfo.rtt !== undefined) {
        lines.push(`├─ 📡 Ping RTT: *${signalInfo.rtt.toFixed(1)} ms*`);
        lines.push(`├─ 📊 Kualitas: ${this._getSignalBar(signalInfo.quality)} *${signalInfo.quality}%*`);
      }

      if (signalInfo.zone) {
        lines.push(`└─ 📍 Zona: ${signalInfo.zone.emoji} *${signalInfo.zone.label}*`);
        lines.push('');
        lines.push(`🗺️ *Estimasi Lokasi:*`);
        lines.push(`    ${signalInfo.zone.description}`);

        // Add warning for far unknown devices
        if (signalInfo.zone.level <= 2 && device.trust_level !== 'trusted') {
          lines.push('');
          lines.push('⚠️ *PERINGATAN:* _Perangkat ini berada di jarak jauh dan bukan trusted!_');
          lines.push('    _Kemungkinan besar penyusup dari luar!_');
          lines.push(`    💡 _Gunakan /blockip ${device.ip} untuk memblokir_`);
        }
      }
    } else {
      lines.push('📡 _Tidak dapat mengukur sinyal/jarak._');
      lines.push('    _Pastikan perangkat online dan terkoneksi._');
    }

    lines.push('');
    lines.push(`⏰ ${this._formatTime()}`);

    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 📡 Radar — All devices with location
  // ─────────────────────────────────────────
  formatRadar(onlineDevices, signalData = new Map()) {
    const lines = [
      '📡 *RADAR JARINGAN — WiFi Guard v2.0*',
      this.divider,
      '',
      `🔍 Memindai *${onlineDevices.length}* perangkat...`,
      '',
    ];

    // Sort devices by signal quality (closest first)
    const devicesWithSignal = onlineDevices.map(d => {
      const signal = signalData.get(d.mac);
      return { device: d, signal };
    }).sort((a, b) => {
      const qualA = a.signal ? (a.signal.quality || 0) : -1;
      const qualB = b.signal ? (b.signal.quality || 0) : -1;
      return qualB - qualA; // Highest quality (closest) first
    });

    // Group by zone
    const zones = {
      5: { label: '🔴 SANGAT DEKAT', devices: [] },
      4: { label: '🟠 DEKAT', devices: [] },
      3: { label: '🟡 SEDANG', devices: [] },
      2: { label: '🔵 JAUH', devices: [] },
      1: { label: '⚪ SANGAT JAUH', devices: [] },
      0: { label: '❓ TIDAK TERDETEKSI', devices: [] },
    };

    devicesWithSignal.forEach(({ device, signal }) => {
      const zoneLevel = signal && signal.zone ? (signal.zone.level || 0) : 0;
      zones[zoneLevel].devices.push({ device, signal });
    });

    // Render each zone
    for (const [level, zone] of Object.entries(zones).sort(([a], [b]) => b - a)) {
      if (zone.devices.length === 0) continue;

      lines.push(`${zone.label} (${zone.devices.length}):`);
      lines.push(this.thinDivider);

      zone.devices.forEach(({ device, signal }) => {
        const d = device;
        const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
        const trustIcon = { trusted: '✅', known: '🟡', unknown: '🔴', blocked: '🚫' };
        const ti = trustIcon[d.trust_level] || '❓';
        const blockedTag = d.is_ip_blocked ? ' 🔥' : '';

        let signalInfo = '';
        if (signal) {
          if (signal.rssi !== undefined) {
            const bar = this._getSignalBar(signal.quality);
            signalInfo = ` | ${bar} ${signal.rssi}dBm`;
          } else if (signal.rtt !== undefined) {
            signalInfo = ` | RTT: ${signal.rtt.toFixed(1)}ms`;
          }
        }

        lines.push(`  ${d.device_icon || '❓'} ${name} ${ti}${blockedTag}`);
        lines.push(`    IP: \`${d.ip}\`${signalInfo}`);

        // Warning for unknown devices far away
        if (parseInt(level) <= 2 && d.trust_level !== 'trusted') {
          lines.push(`    ⚠️ _WASPADA: Device asing dari jarak jauh!_`);
        }

        lines.push('');
      });
    }

    lines.push(this.divider);
    lines.push(`📊 Total: *${onlineDevices.length}* perangkat online`);
    lines.push(`⏰ ${this._formatTime()}`);
    lines.push('');
    lines.push('💡 _Gunakan /locate <IP> untuk detail lokasi_');
    lines.push('💡 _Gunakan /blockip <IP> untuk blokir penyusup_');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // Utility: Get signal bar visual
  // ─────────────────────────────────────────
  _getSignalBar(qualityPercent) {
    const totalBars = 10;
    const filled = Math.round(((qualityPercent || 0) / 100) * totalBars);
    const empty = totalBars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
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
