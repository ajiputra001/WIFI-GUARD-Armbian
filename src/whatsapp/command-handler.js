// ═══════════════════════════════════════════════════════════════
// 🤖 Command Handler — WiFi Guard Bot
// Handle semua perintah yang dikirim via WhatsApp
// ═══════════════════════════════════════════════════════════════

class CommandHandler {
  constructor({ db, scanner, identifier, formatter, alertEngine, waClient }) {
    this.db = db;
    this.scanner = scanner;
    this.identifier = identifier;
    this.formatter = formatter;
    this.alertEngine = alertEngine;
    this.waClient = waClient;
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
    if (!body.startsWith('!')) return;

    const parts = body.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    console.log(`📨 Command received: ${command} ${args.join(' ')}`);

    try {
      switch (command) {
        case '!help':
          return this._handleHelp(msg);
        case '!status':
          return this._handleStatus(msg);
        case '!devices':
        case '!device':
        case '!list':
          return this._handleDevices(msg);
        case '!scan':
          return this._handleScan(msg);
        case '!trust':
          return this._handleTrust(msg, args);
        case '!untrust':
          return this._handleUntrust(msg, args);
        case '!block':
          return this._handleBlock(msg, args);
        case '!name':
          return this._handleName(msg, args);
        case '!history':
          return this._handleHistory(msg);
        case '!stats':
        case '!stat':
          return this._handleStats(msg);
        case '!whitelist':
        case '!trusted':
          return this._handleWhitelist(msg);
        case '!unknown':
          return this._handleUnknown(msg);
        case '!alert':
          return this._handleAlertToggle(msg, args);
        case '!ping':
          return this._handlePing(msg);
        default:
          return this.waClient.reply(msg, '❓ Perintah tidak dikenal. Ketik *!help* untuk daftar perintah.');
      }
    } catch (error) {
      console.error('❌ Command error:', error);
      return this.waClient.reply(msg, '❌ Terjadi error saat memproses perintah.');
    }
  }

  // ═══════════════════════════════════════════
  // Command Handlers
  // ═══════════════════════════════════════════

  async _handleHelp(msg) {
    const text = this.formatter.formatHelp();
    return this.waClient.reply(msg, text);
  }

  async _handleStatus(msg) {
    const systemInfo = this.scanner.getSystemInfo();
    const stats = this.db.getStats();
    const text = this.formatter.formatStatus(systemInfo, stats);
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
      return this.waClient.reply(msg, '❌ Format: `!trust <MAC>`\nContoh: `!trust AA:BB:CC:DD:EE:FF`');
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
      return this.waClient.reply(msg, '❌ Format: `!untrust <MAC>`');
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
      return this.waClient.reply(msg, '❌ Format: `!block <MAC>`\nContoh: `!block AA:BB:CC:DD:EE:FF`');
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
      return this.waClient.reply(msg, '❌ Format: `!name <MAC> <nama>`\nContoh: `!name AA:BB:CC:DD:EE:FF HP Aji`');
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
      return this.waClient.reply(msg, '✅ *WHITELIST*\n\n_Belum ada perangkat trusted._\nGunakan `!trust <MAC>` untuk menambah.');
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

    lines.push('💡 _Gunakan !trust <MAC> untuk trust_');
    lines.push('💡 _Gunakan !block <MAC> untuk block_');

    return this.waClient.reply(msg, lines.join('\n'));
  }

  async _handleAlertToggle(msg, args) {
    if (args.length === 0) {
      const status = this.alertEngine.alertsEnabled ? 'ON ✅' : 'OFF ❌';
      return this.waClient.reply(msg, `🔔 Alert saat ini: *${status}*\n\nGunakan \`!alert on\` atau \`!alert off\``);
    }

    const toggle = args[0].toLowerCase();
    
    if (toggle === 'on') {
      this.alertEngine.alertsEnabled = true;
      return this.waClient.reply(msg, '🔔 Alert *DIAKTIFKAN* ✅');
    } else if (toggle === 'off') {
      this.alertEngine.alertsEnabled = false;
      return this.waClient.reply(msg, '🔕 Alert *DINONAKTIFKAN* ❌');
    } else {
      return this.waClient.reply(msg, '❌ Gunakan `!alert on` atau `!alert off`');
    }
  }

  async _handlePing(msg) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    return this.waClient.reply(msg, `🏓 *Pong!*\n⏱️ Bot uptime: ${hours}h ${mins}m\n✅ Bot berjalan normal`);
  }
}

module.exports = CommandHandler;
