// ═══════════════════════════════════════════════════════════════
// 🤖 Command Handler — WiFi Guard Bot v2.0
// Handle semua perintah yang dikirim via WhatsApp
// Prefix: / (garis miring)
// ═══════════════════════════════════════════════════════════════

class CommandHandler {
  constructor({ db, scanner, identifier, formatter, alertEngine, waClient, firewall, signalTracker }) {
    this.db = db;
    this.scanner = scanner;
    this.identifier = identifier;
    this.formatter = formatter;
    this.alertEngine = alertEngine;
    this.waClient = waClient;
    this.firewall = firewall || null;
    this.signalTracker = signalTracker || null;
    this.alertPhoneNumber = waClient.alertPhoneNumber;
  }

  // ─────────────────────────────────────────
  // Check if message is from authorized user or group
  // ─────────────────────────────────────────
  isAuthorized(msg) {
    if (msg.fromMe === true) return true;
    if (!this.alertPhoneNumber) return false;

    const alertTarget = this.alertPhoneNumber.trim();

    // Check if target is a WhatsApp Group (@g.us)
    if (alertTarget.endsWith('@g.us')) {
      if (msg.from === alertTarget || msg.to === alertTarget) {
        return true;
      }
    }

    const targetDigits = alertTarget.replace(/\D/g, '');
    if (!targetDigits) return false;

    // Extract digits from msg.from, msg.author, and msg.to
    const fromDigits = (msg.from || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const authorDigits = (msg.author || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const toDigits = (msg.to || '').split('@')[0].split(':')[0].replace(/\D/g, '');

    return fromDigits.includes(targetDigits) || 
           authorDigits.includes(targetDigits) || 
           toDigits.includes(targetDigits);
  }

  // ─────────────────────────────────────────
  // Process incoming message
  // ─────────────────────────────────────────
  async handleMessage(msg) {
    // Only process messages from authorized number
    if (!this.isAuthorized(msg)) return;

    const body = msg.body.trim();
    if (!body.startsWith('/')) return;

    const parts = body.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    console.log(`📨 Command received: ${command} ${args.join(' ')}`);

    try {
      switch (command) {
        case '/help':
          return this._handleHelp(msg);
        case '/status':
          return this._handleStatus(msg);
        case '/devices':
        case '/device':
        case '/list':
          return this._handleDevices(msg);
        case '/scan':
          return this._handleScan(msg);
        case '/trust':
          return this._handleTrust(msg, args);
        case '/untrust':
          return this._handleUntrust(msg, args);
        case '/block':
          return this._handleBlock(msg, args);
        case '/name':
          return this._handleName(msg, args);
        case '/history':
          return this._handleHistory(msg);
        case '/stats':
        case '/stat':
          return this._handleStats(msg);
        case '/whitelist':
        case '/trusted':
          return this._handleWhitelist(msg);
        case '/unknown':
          return this._handleUnknown(msg);
        case '/alert':
          return this._handleAlertToggle(msg, args);
        case '/ping':
          return this._handlePing(msg);
        // ═══ NEW v2.0 Commands ═══
        case '/blockip':
          return this._handleBlockIP(msg, args);
        case '/unblockip':
          return this._handleUnblockIP(msg, args);
        case '/blocked':
          return this._handleBlockedList(msg);
        case '/locate':
          return this._handleLocate(msg, args);
        case '/radar':
          return this._handleRadar(msg);
        default:
          return this.waClient.reply(msg, '❓ Perintah tidak dikenal. Ketik */help* untuk daftar perintah.');
      }
    } catch (error) {
      console.error('❌ Command error:', error);
      return this.waClient.reply(msg, '❌ Terjadi error saat memproses perintah.');
    }
  }

  // ═══════════════════════════════════════════
  // Original Command Handlers (updated to / prefix)
  // ═══════════════════════════════════════════

  async _handleHelp(msg) {
    const text = this.formatter.formatHelp();
    return this.waClient.reply(msg, text);
  }

  async _handleStatus(msg) {
    await this.waClient.reply(msg, '⏳ _Mengumpulkan data status..._');

    const systemInfo = this.scanner.getSystemInfo();
    const stats = this.db.getStats();
    const onlineDevices = this.db.getOnlineDevices();
    const blockedIPs = this.firewall ? this.firewall.getBlockedList() : [];

    // Gather signal data for all online devices
    let signalData = new Map();
    if (this.signalTracker) {
      try {
        signalData = await this.signalTracker.getAllDeviceSignals(onlineDevices);
      } catch (error) {
        console.log('⚠️  Signal tracking error:', error.message);
      }
    }

    const scanCount = this.alertEngine ? this.alertEngine._scanCount : 0;
    const text = this.formatter.formatStatus(systemInfo, stats, onlineDevices, signalData, blockedIPs, scanCount);
    return this.waClient.reply(msg, text);
  }

  async _handleDevices(msg) {
    const devices = this.db.getOnlineDevices();
    const text = this.formatter.formatDeviceList(devices);
    return this.waClient.reply(msg, text);
  }

  async _handleScan(msg) {
    await this.waClient.reply(msg, '🔍 _Memulai scan jaringan..._');
    
    // Trigger a scan via the alert engine
    if (this.alertEngine) {
      await this.alertEngine.performScan();
    }

    const devices = this.db.getOnlineDevices();
    const text = this.formatter.formatDeviceList(devices);
    return this.waClient.reply(msg, `✅ *Scan selesai!*\n\n${text}`);
  }

  async _handleTrust(msg, args) {
    if (args.length === 0) {
      return this.waClient.reply(msg, '❌ Format: `/trust <MAC>`\nContoh: `/trust AA:BB:CC:DD:EE:FF`');
    }

    const mac = args[0].toUpperCase();
    const success = this.db.setTrustLevel(mac, 'trusted');
    
    if (success) {
      const device = this.db.getDeviceByMAC(mac);
      const text = this.formatter.formatTrustConfirm(device, 'trusted');
      return this.waClient.reply(msg, text);
    } else {
      return this.waClient.reply(msg, `❌ Perangkat dengan MAC \`${mac}\` tidak ditemukan.`);
    }
  }

  async _handleUntrust(msg, args) {
    if (args.length === 0) {
      return this.waClient.reply(msg, '❌ Format: `/untrust <MAC>`');
    }

    const mac = args[0].toUpperCase();
    const success = this.db.setTrustLevel(mac, 'unknown');
    
    if (success) {
      const device = this.db.getDeviceByMAC(mac);
      const text = this.formatter.formatTrustConfirm(device, 'unknown');
      return this.waClient.reply(msg, text);
    } else {
      return this.waClient.reply(msg, `❌ Perangkat dengan MAC \`${mac}\` tidak ditemukan.`);
    }
  }

  async _handleBlock(msg, args) {
    if (args.length === 0) {
      return this.waClient.reply(msg, '❌ Format: `/block <MAC>`\nContoh: `/block AA:BB:CC:DD:EE:FF`');
    }

    const mac = args[0].toUpperCase();
    const success = this.db.setTrustLevel(mac, 'blocked');
    
    if (success) {
      const device = this.db.getDeviceByMAC(mac);
      const text = this.formatter.formatTrustConfirm(device, 'blocked');
      return this.waClient.reply(msg, text);
    } else {
      return this.waClient.reply(msg, `❌ Perangkat dengan MAC \`${mac}\` tidak ditemukan.`);
    }
  }

  async _handleName(msg, args) {
    if (args.length < 2) {
      return this.waClient.reply(msg, '❌ Format: `/name <MAC> <nama>`\nContoh: `/name AA:BB:CC:DD:EE:FF HP Aji`');
    }

    const mac = args[0].toUpperCase();
    const name = args.slice(1).join(' ');
    
    const device = this.db.getDeviceByMAC(mac);
    if (!device) {
      return this.waClient.reply(msg, `❌ Perangkat dengan MAC \`${mac}\` tidak ditemukan.`);
    }

    this.db.setCustomName(mac, name);
    const text = this.formatter.formatNameSet(mac, name);
    return this.waClient.reply(msg, text);
  }

  async _handleHistory(msg) {
    const logs = this.db.getHistory(24, 30);
    const text = this.formatter.formatHistory(logs);
    return this.waClient.reply(msg, text);
  }

  async _handleStats(msg) {
    const stats = this.db.getStats();
    const text = this.formatter.formatStats(stats);
    return this.waClient.reply(msg, text);
  }

  async _handleWhitelist(msg) {
    const devices = this.db.getDevicesByTrust('trusted');
    
    if (devices.length === 0) {
      return this.waClient.reply(msg, '✅ *WHITELIST*\n\n_Belum ada perangkat trusted._\nGunakan `/trust <MAC>` untuk menambah.');
    }

    const lines = [
      '✅ *DAFTAR PERANGKAT TRUSTED*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    devices.forEach((d, i) => {
      const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
      const status = d.is_online ? '🟢 Online' : '🔴 Offline';
      lines.push(`*${i + 1}.* ${d.device_icon || '❓'} ${name}`);
      lines.push(`    MAC: \`${d.mac}\` | ${status}`);
      lines.push('');
    });

    return this.waClient.reply(msg, lines.join('\n'));
  }

  async _handleUnknown(msg) {
    const devices = this.db.getDevicesByTrust('unknown');
    
    if (devices.length === 0) {
      return this.waClient.reply(msg, '🔴 *UNKNOWN DEVICES*\n\n_Tidak ada perangkat unknown._');
    }

    const lines = [
      '🔴 *DAFTAR PERANGKAT UNKNOWN*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    devices.forEach((d, i) => {
      const name = d.custom_name || d.hostname || d.vendor || 'Unknown';
      const status = d.is_online ? '🟢 Online' : '🔴 Offline';
      lines.push(`*${i + 1}.* ${d.device_icon || '❓'} ${name}`);
      lines.push(`    MAC: \`${d.mac}\` | ${status}`);
      lines.push(`    First seen: ${d.first_seen}`);
      lines.push('');
    });

    lines.push('💡 _Gunakan /trust <MAC> untuk trust_');
    lines.push('💡 _Gunakan /block <MAC> untuk block_');
    lines.push('💡 _Gunakan /blockip <IP> untuk blokir akses internet_');

    return this.waClient.reply(msg, lines.join('\n'));
  }

  async _handleAlertToggle(msg, args) {
    if (args.length === 0) {
      const status = this.alertEngine.alertsEnabled ? 'ON ✅' : 'OFF ❌';
      return this.waClient.reply(msg, `🔔 Alert saat ini: *${status}*\n\nGunakan \`/alert on\` atau \`/alert off\``);
    }

    const toggle = args[0].toLowerCase();
    
    if (toggle === 'on') {
      this.alertEngine.alertsEnabled = true;
      return this.waClient.reply(msg, '🔔 Alert *DIAKTIFKAN* ✅');
    } else if (toggle === 'off') {
      this.alertEngine.alertsEnabled = false;
      return this.waClient.reply(msg, '🔕 Alert *DINONAKTIFKAN* ❌');
    } else {
      return this.waClient.reply(msg, '❌ Gunakan `/alert on` atau `/alert off`');
    }
  }

  async _handlePing(msg) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    return this.waClient.reply(msg, `🏓 *Pong!*\n⏱️ Bot uptime: ${hours}h ${mins}m\n✅ Bot berjalan normal`);
  }

  // ═══════════════════════════════════════════
  // NEW v2.0 Commands
  // ═══════════════════════════════════════════

  // ─────────────────────────────────────────
  // /blockip <IP> — Block IP via ARP Spoofing
  // ─────────────────────────────────────────
  async _handleBlockIP(msg, args) {
    if (!this.firewall) {
      return this.waClient.reply(msg, '❌ Firewall module tidak tersedia.');
    }

    if (args.length === 0) {
      return this.waClient.reply(msg, [
        '❌ *Format:* `/blockip <IP>`',
        '',
        '📌 *Contoh:*',
        '`/blockip 192.168.1.150`',
        '',
        '💡 _Gunakan /devices untuk melihat IP perangkat_',
        '⚠️ _Block menggunakan ARP Spoofing — efektif walau STB bukan router_',
      ].join('\n'));
    }

    const ip = args[0];
    await this.waClient.reply(msg, `🔒 _Memblokir ${ip}..._`);

    // Find device by IP in database
    const device = this.db.getDeviceByIP(ip);
    const mac = device ? device.mac : null;

    const result = await this.firewall.blockIP(ip, mac);

    if (result.success) {
      // Update database
      if (device) {
        this.db.setTrustLevel(device.mac, 'blocked');
        this.db.setIPBlocked(device.mac, true);
      }

      const text = this.formatter.formatBlockIPConfirm(device, ip, result.methods);
      return this.waClient.reply(msg, text);
    } else {
      return this.waClient.reply(msg, `❌ Gagal memblokir ${ip}: ${result.error}`);
    }
  }

  // ─────────────────────────────────────────
  // /unblockip <IP> — Unblock IP
  // ─────────────────────────────────────────
  async _handleUnblockIP(msg, args) {
    if (!this.firewall) {
      return this.waClient.reply(msg, '❌ Firewall module tidak tersedia.');
    }

    if (args.length === 0) {
      return this.waClient.reply(msg, [
        '❌ *Format:* `/unblockip <IP>`',
        '',
        '📌 *Contoh:*',
        '`/unblockip 192.168.1.150`',
        '',
        '💡 _Gunakan /blocked untuk melihat IP yang diblok_',
      ].join('\n'));
    }

    const ip = args[0];
    await this.waClient.reply(msg, `🔓 _Membuka blokir ${ip}..._`);

    const device = this.db.getDeviceByIP(ip);
    const mac = device ? device.mac : null;

    const result = await this.firewall.unblockIP(ip, mac);

    if (result.success) {
      // Update database
      if (device) {
        this.db.setTrustLevel(device.mac, 'unknown');
        this.db.setIPBlocked(device.mac, false);
      }

      const text = this.formatter.formatUnblockIPConfirm(device, ip);
      return this.waClient.reply(msg, text);
    } else {
      return this.waClient.reply(msg, `❌ Gagal membuka blokir ${ip}`);
    }
  }

  // ─────────────────────────────────────────
  // /blocked — List all blocked IPs
  // ─────────────────────────────────────────
  async _handleBlockedList(msg) {
    const firewallBlocked = this.firewall ? this.firewall.getBlockedList() : [];
    const dbBlocked = this.db.getIPBlockedDevices();

    const text = this.formatter.formatBlockedList(firewallBlocked, dbBlocked);
    return this.waClient.reply(msg, text);
  }

  // ─────────────────────────────────────────
  // /locate <MAC or IP> — Estimate device location
  // ─────────────────────────────────────────
  async _handleLocate(msg, args) {
    if (!this.signalTracker) {
      return this.waClient.reply(msg, '❌ Signal tracker tidak tersedia.');
    }

    if (args.length === 0) {
      return this.waClient.reply(msg, [
        '❌ *Format:* `/locate <MAC atau IP>`',
        '',
        '📌 *Contoh:*',
        '`/locate AA:BB:CC:DD:EE:FF`',
        '`/locate 192.168.1.150`',
        '',
        '💡 _Estimasi lokasi berdasarkan kekuatan sinyal/RTT_',
      ].join('\n'));
    }

    const target = args[0];
    await this.waClient.reply(msg, `📡 _Menganalisis sinyal ${target}..._`);

    // Find device by MAC or IP
    let device = null;
    if (target.includes(':')) {
      device = this.db.getDeviceByMAC(target.toUpperCase());
    } else if (target.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      device = this.db.getDeviceByIP(target);
    }

    if (!device) {
      return this.waClient.reply(msg, `❌ Perangkat \`${target}\` tidak ditemukan di database.`);
    }

    if (!device.is_online) {
      return this.waClient.reply(msg, `❌ Perangkat \`${target}\` sedang offline. Hanya bisa melacak perangkat yang online.`);
    }

    const signalInfo = await this.signalTracker.getDeviceSignal(device);
    const text = this.formatter.formatDeviceLocation(device, signalInfo);
    return this.waClient.reply(msg, text);
  }

  // ─────────────────────────────────────────
  // /radar — Scan all devices + show location
  // ─────────────────────────────────────────
  async _handleRadar(msg) {
    if (!this.signalTracker) {
      return this.waClient.reply(msg, '❌ Signal tracker tidak tersedia.');
    }

    await this.waClient.reply(msg, '📡 _Scanning semua perangkat & menganalisis sinyal..._');

    const onlineDevices = this.db.getOnlineDevices();

    if (onlineDevices.length === 0) {
      return this.waClient.reply(msg, '📡 *RADAR*\n\n_Tidak ada perangkat online_');
    }

    const signalData = await this.signalTracker.getAllDeviceSignals(onlineDevices);
    const text = this.formatter.formatRadar(onlineDevices, signalData);
    return this.waClient.reply(msg, text);
  }
}

module.exports = CommandHandler;
