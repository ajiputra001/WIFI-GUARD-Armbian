// ═══════════════════════════════════════════════════════════════
// ⚡ Alert Engine — WiFi Guard Bot
// Process scan results, detect changes, and send alerts
// ═══════════════════════════════════════════════════════════════

const cron = require('node-cron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const googleTTS = require('google-tts-api');

class AlertEngine {
  constructor({ db, scanner, identifier, formatter, waClient, signalTracker, config = {} }) {
    this.db = db;
    this.scanner = scanner;
    this.identifier = identifier;
    this.formatter = formatter;
    this.waClient = waClient;
    this.signalTracker = signalTracker || null;
    
    // Config
    this.scanInterval = (config.scanInterval || 3) * 1000; // ms (3s default)
    this.deepScanInterval = (config.deepScanInterval || 5) * 60 * 1000; // ms
    this.alertsEnabled = config.alertsEnabled !== false;
    this.alertOnDisconnect = config.alertOnDisconnect !== false; // Enabled by default for real-time alerts
    this.dailyReportEnabled = config.dailyReportEnabled !== false;
    this.dailyReportHour = config.dailyReportHour || 8;
    this.dailyReportMinute = config.dailyReportMinute || 0;

    // Voice Alert Config (Speaker Out)
    this.voiceAlertEnabled = config.voiceAlertEnabled !== false;
    this.voiceAlertStyle = config.voiceAlertStyle || 'anime';
    this.voiceAlertLang = config.voiceAlertLang || 'id';
    this.voiceAlertPitch = config.voiceAlertPitch || 92;
    this.voiceAlertSpeed = config.voiceAlertSpeed || 165;
    this.voiceAlertOnNewDevice = config.voiceAlertOnNewDevice !== false;
    this.voiceAlertOnReconnect = config.voiceAlertOnReconnect === true;
    this.voiceAlertOnDisconnect = config.voiceAlertOnDisconnect === true;

    // State
    this._scanTimer = null;
    this._deepScanTimer = null;
    this._cronJob = null;
    this._isScanning = false;
    this._scanCount = 0;
    this._onDeviceUpdate = null; // Callback for dashboard
    this._ipMonitorProcess = null;
    this._debounceTimer = null;
    this._missedScans = new Map(); // Track consecutive missed scans per MAC to prevent Wi-Fi sleep flicker spam
  }

  // ─────────────────────────────────────────
  // Set callback for real-time dashboard updates
  // ─────────────────────────────────────────
  onDeviceUpdate(callback) {
    this._onDeviceUpdate = callback;
  }

  // ─────────────────────────────────────────
  // Start real-time netlink listener (ip monitor neigh)
  // ─────────────────────────────────────────
  _startRealtimeMonitor() {
    try {
      this._ipMonitorProcess = spawn('ip', ['monitor', 'neigh']);
      console.log('⚡ Real-time Kernel Netlink Monitor active (instant detection)');

      this._ipMonitorProcess.stdout.on('data', (data) => {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.performScan();
        }, 500);
      });

      this._ipMonitorProcess.on('error', (err) => {
        console.log('⚠️  ip monitor unavailable, relying on fast polling scan');
      });
    } catch (e) {
      console.log('⚠️  Real-time netlink monitor init error:', e.message);
    }
  }

  // ─────────────────────────────────────────
  // Start the alert engine
  // ─────────────────────────────────────────
  start() {
    console.log('⚡ Alert Engine started');
    console.log(`   📡 Scan interval: ${this.scanInterval / 1000}s (real-time active)`);
    console.log(`   🔍 Deep scan interval: ${this.deepScanInterval / 60000}m`);
    console.log(`   🔔 Alerts: ${this.alertsEnabled ? 'ON' : 'OFF'}`);
    console.log(`   🔊 Voice Alert (Speaker): ${this.voiceAlertEnabled ? 'ON (' + this.voiceAlertLang + ')' : 'OFF'}`);
    console.log(`   📊 Daily report: ${this.dailyReportEnabled ? 'ON' : 'OFF'}`);

    // Start instant kernel ARP listener
    this._startRealtimeMonitor();

    // Initial scan
    this.performScan();

    // Periodic fast scan (fallback loop)
    this._scanTimer = setInterval(() => this.performScan(), this.scanInterval);

    // Periodic deep scan (less frequent, with nmap)
    this._deepScanTimer = setInterval(() => this.performDeepScan(), this.deepScanInterval);

    // Daily report cron
    if (this.dailyReportEnabled) {
      const cronExpr = `${this.dailyReportMinute} ${this.dailyReportHour} * * *`;
      this._cronJob = cron.schedule(cronExpr, () => this.sendDailyReport());
      console.log(`   📅 Daily report at ${String(this.dailyReportHour).padStart(2, '0')}:${String(this.dailyReportMinute).padStart(2, '0')}`);
    }

    // Cleanup old logs weekly
    cron.schedule('0 3 * * 0', () => {
      this.db.cleanupLogs(30);
      console.log('🧹 Old logs cleaned up');
    });
  }

  // ─────────────────────────────────────────
  // Stop the alert engine
  // ─────────────────────────────────────────
  stop() {
    if (this._scanTimer) clearInterval(this._scanTimer);
    if (this._deepScanTimer) clearInterval(this._deepScanTimer);
    if (this._cronJob) this._cronJob.stop();
    if (this._ipMonitorProcess) {
      try { this._ipMonitorProcess.kill(); } catch {}
    }
    console.log('⚡ Alert Engine stopped');
  }

  // ─────────────────────────────────────────
  // Perform a fast scan (arp-scan)
  // ─────────────────────────────────────────
  async performScan() {
    if (this._isScanning) return;
    this._isScanning = true;

    try {
      const startTime = Date.now();
      const result = await this.scanner.fullScan();
      const scanDuration = Date.now() - startTime;

      this._scanCount++;

      // Get previously online devices
      const previouslyOnline = this.db.getOnlineDevices();
      const currentMACs = new Set(result.devices.map(d => d.mac));

      let newDeviceCount = 0;
      let disconnectedCount = 0;

      // Process each detected device
      for (const rawDevice of result.devices) {
        // Reset missed scans counter for active device
        this._missedScans.delete(rawDevice.mac);

        // Identify device
        const device = this.identifier.identifyDevice(rawDevice);
        
        // Check if device is new
        const existingDevice = this.db.getDeviceByMAC(device.mac);
        const isNew = !existingDevice;
        const wasOffline = existingDevice && !existingDevice.is_online;

        // Add/update in database
        const dbResult = this.db.addOrUpdateDevice(device);

        if (isNew) {
          // Brand new device — never seen before!
          newDeviceCount++;
          const deviceId = dbResult.id || this.db.getDeviceByMAC(device.mac).id;
          this.db.logConnection(deviceId, device.mac, 'connect', device.ip);
          
          device.threatLevel = 'unknown';
          await this._alertNewDevice(device);
          
          if (this._onDeviceUpdate) {
            this._onDeviceUpdate('new_device', device);
          }

        } else if (wasOffline) {
          // Known device reconnected after being marked offline
          this.db.incrementConnections(device.mac);
          const deviceId = existingDevice.id;
          this.db.logConnection(deviceId, device.mac, 'connect', device.ip);
          
          const fullDevice = {
            ...existingDevice,
            ...device,
            hostname: device.hostname || existingDevice.hostname || null,
            custom_name: existingDevice.custom_name || device.custom_name || null,
          };

          // Only send reconnect alert if device was offline for more than 20 seconds (prevents sleep flicker spam)
          const offlineDurationMs = existingDevice.last_seen 
            ? (Date.now() - new Date(existingDevice.last_seen).getTime()) 
            : 60000;

          if (offlineDurationMs > 20000) {
            await this._alertReconnect(fullDevice);
          }

          if (this._onDeviceUpdate) {
            this._onDeviceUpdate('reconnect', fullDevice);
          }
        }
      }

      // Detect truly disconnected devices (must miss at least 4 consecutive scans = ~12-15s)
      for (const prevDevice of previouslyOnline) {
        if (!currentMACs.has(prevDevice.mac)) {
          const missed = (this._missedScans.get(prevDevice.mac) || 0) + 1;
          this._missedScans.set(prevDevice.mac, missed);

          // Mark offline ONLY after 4 consecutive missed scans
          if (missed >= 4) {
            this._missedScans.delete(prevDevice.mac);
            disconnectedCount++;
            this.db.setDeviceOffline(prevDevice.mac);
            this.db.logConnection(prevDevice.id, prevDevice.mac, 'disconnect', prevDevice.ip);
            
            if (this.alertOnDisconnect) {
              await this._alertDisconnect(prevDevice);
            }

            if (this._onDeviceUpdate) {
              this._onDeviceUpdate('disconnect', prevDevice);
            }
          }
        }
      }

      // Log scan
      const totalOnline = this.db.getOnlineDevices().length;
      this.db.logScan(totalOnline, newDeviceCount, disconnectedCount, scanDuration);

      // Log to console (every 10th scan or when changes detected)
      if (this._scanCount % 10 === 0 || newDeviceCount > 0 || disconnectedCount > 0) {
        const icon = newDeviceCount > 0 ? '🚨' : disconnectedCount > 0 ? '📴' : '✅';
        console.log(
          `${icon} Scan #${this._scanCount}: ${totalOnline} online` +
          (newDeviceCount > 0 ? `, +${newDeviceCount} new` : '') +
          (disconnectedCount > 0 ? `, -${disconnectedCount} left` : '') +
          ` (${scanDuration}ms)`
        );
      }

      // Notify dashboard
      if (this._onDeviceUpdate) {
        this._onDeviceUpdate('scan_complete', {
          onlineDevices: this.db.getOnlineDevices(),
          stats: this.db.getStats(),
          scanCount: this._scanCount
        });
      }

    } catch (error) {
      console.error('❌ Scan error:', error.message);
    } finally {
      this._isScanning = false;
    }
  }

  // ─────────────────────────────────────────
  // Perform a deep scan (nmap enrichment)
  // ─────────────────────────────────────────
  async performDeepScan() {
    try {
      console.log('🔍 Starting deep scan (nmap)...');
      const onlineDevices = this.db.getOnlineDevices();
      
      const nmapDevices = await this.scanner.scanWithNmap();
      
      let enriched = 0;
      for (const nmapDevice of nmapDevices) {
        if (!nmapDevice.mac) continue;
        
        const existing = this.db.getDeviceByMAC(nmapDevice.mac);
        if (existing) {
          // Update with nmap data
          const device = this.identifier.identifyDevice({
            ...existing,
            hostname: nmapDevice.hostname || existing.hostname,
            os: nmapDevice.os || existing.os,
            nmapVendor: nmapDevice.nmapVendor || existing.nmap_vendor,
          });
          this.db.addOrUpdateDevice(device);
          enriched++;
        }
      }

      console.log(`🔍 Deep scan complete: ${enriched} devices enriched`);
    } catch (error) {
      console.error('❌ Deep scan error:', error.message);
    }
  }

  // ─────────────────────────────────────────
  // Helper: Format phonetic text so TTS reads words naturally instead of spelling letters (OPPO -> Oppo F 11)
  // ─────────────────────────────────────────
  _formatForPhoneticSpeech(text) {
    if (!text) return '';
    let clean = text
      .replace(/\.(lan|local|home|domain|router|localdomain)$/i, '')
      .replace(/[-_]/g, ' ')
      .trim();

    // Ubah kata kapital penuh 3+ huruf (seperti OPPO, REDMI, GALAXY) ke TitleCase agar dibaca sebagai kata, bukan dieja O-P-P-O
    clean = clean.replace(/\b[A-Z]{3,}\b/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
    
    // Berikan spasi antara huruf dan angka (misal: F11 -> F 11)
    clean = clean.replace(/([a-zA-Z])(\d+)/g, '$1 $2');

    return clean;
  }

  // ─────────────────────────────────────────
  // Helper: Format device name for clear Indonesian Speech
  // ─────────────────────────────────────────
  _getReadableDeviceName(device) {
    if (!device) return 'tanpa nama';

    // 1. Prioritas Utama: Custom Name yang diisi user di Dashboard
    const custom = device.custom_name || device.customName;
    if (custom && custom.trim() !== '') return this._formatForPhoneticSpeech(custom.trim());

    // 2. Hostname perangkat (misal: "OPPO-F11.lan" -> "Oppo F 11", "Galaxy-A03s.lan" -> "Galaxy A 03s")
    const host = device.hostname || device.name;
    if (host && !host.includes('Private MAC') && !host.includes(':')) {
      let cleanHost = this._formatForPhoneticSpeech(host);
      if (cleanHost && cleanHost.toLowerCase() !== 'unknown') {
        return cleanHost;
      }
    }

    // 3. Vendor Pabrikan perangkat
    const vendor = device.vendor || device.nmapVendor || device.nmap_vendor;
    if (vendor && vendor !== 'Unknown' && !vendor.includes('Private MAC') && !vendor.includes('Randomized') && !vendor.includes('locally administered')) {
      const cleanVendor = vendor.split(',')[0].replace(/(Technologies|Technology|Inc|Corp|Ltd|Co\.)/gi, '').trim();
      return `merek ${this._formatForPhoneticSpeech(cleanVendor || vendor)}`;
    }

    // 4. Jenis Perangkat / Type
    const label = device.device_label || device.label;
    if (label && label !== 'Tidak Diketahui' && label !== 'unknown') {
      return `perangkat ${label}`;
    }

    return 'tanpa nama';
  }

  // ─────────────────────────────────────────
  // Helper: Maximize ALSA soundcard volume (100% Full)
  // ─────────────────────────────────────────
  _maximizeAlsaVolume() {
    try {
      const cmd = `for c in 0 1 2; do ` +
                  `amixer -c $c sset 'Master' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'Speaker' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'Headphone' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'PCM' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'Line Out' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'ACODEC' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'ACODEC Volu' 100% unmute 2>/dev/null || true; ` +
                  `amixer -c $c sset 'AIU ACODEC' 100% unmute 2>/dev/null || true; ` +
                  `done; ` +
                  `amixer sset 'Master' 100% unmute 2>/dev/null || true; ` +
                  `amixer sset 'Speaker' 100% unmute 2>/dev/null || true; ` +
                  `amixer sset 'PCM' 100% unmute 2>/dev/null || true;`;
      exec(cmd, () => {});
    } catch {}
  }

  // ─────────────────────────────────────────
  // Text-To-Speech Voice Alert (Suara Manusia AI Jernih)
  // ─────────────────────────────────────────
  async speakVoiceAlert(text) {
    if (!this.voiceAlertEnabled) return;

    // Pastikan volume ALSA selalu 100% MAX full
    this._maximizeAlsaVolume();

    const realUser = process.env.SUDO_USER || 'ajiputra';
    const realUid = process.env.SUDO_UID || '1000';
    const lang = this.voiceAlertLang || 'id';

    const tag = this.voiceAlertStyle === 'stasiun' 
      ? '🚆 [Pengumuman Stasiun]' 
      : this.voiceAlertStyle === 'anime' 
      ? '🌸 [Anime Voice]' 
      : '🎙️ [Suara Manusia AI]';

    console.log(`${tag}: "${text}"`);

    try {
      // 1. Dapatkan audio berkualitas manusia jernih (Google Neural Human Voice)
      const base64 = await googleTTS.getAudioBase64(text, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      });

      const mp3File = `/tmp/wifi_alert_${Date.now()}.mp3`;
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(mp3File, buffer);

      // Play via mpg123 / mpv / ffplay / gst-play-1.0 langsung ke USB Soundcard (plughw:1,0) & ALSA AUX (plughw:0,0) Armbian STB
      const userEnv = `XDG_RUNTIME_DIR=/run/user/${realUid} PULSE_SERVER=unix:/run/user/${realUid}/pulse/native`;
      const playCmd = `mpg123 -a plughw:1,0 -q ${mp3File} 2>/dev/null || ` +
                      `mpg123 -a plughw:0,0 -q ${mp3File} 2>/dev/null || ` +
                      `mpg123 -a hw:1,0 -q ${mp3File} 2>/dev/null || ` +
                      `mpg123 -a hw:0,0 -q ${mp3File} 2>/dev/null || ` +
                      `mpg123 -q ${mp3File} 2>/dev/null || ` +
                      `mpv --audio-device=alsa/plughw:1,0 --no-video --really-quiet ${mp3File} 2>/dev/null || ` +
                      `mpv --audio-device=alsa/plughw:0,0 --no-video --really-quiet ${mp3File} 2>/dev/null || ` +
                      `mpv --no-video --really-quiet ${mp3File} 2>/dev/null || ` +
                      `ffplay -nodisp -autoexit -loglevel quiet ${mp3File} 2>/dev/null || ` +
                      `gst-play-1.0 --no-interactive ${mp3File} 2>/dev/null || ` +
                      `sudo -u ${realUser} ${userEnv} gst-play-1.0 --no-interactive ${mp3File} 2>/dev/null`;

      exec(`${playCmd} ; rm -f ${mp3File} 2>/dev/null`, (err) => {
        if (err) {
          this._fallbackEspeak(text, realUser, realUid, lang);
        }
      });

    } catch (e) {
      // Fallback jika offline
      this._fallbackEspeak(text, realUser, realUid, lang);
    }
  }

  // Fallback offline (jika koneksi internet terputus)
  _fallbackEspeak(text, realUser, realUid, lang) {
    const safeText = text.replace(/"/g, '\\"').replace(/`/g, '');
    const voiceVariant = this.voiceAlertStyle === 'anime' ? `${lang}+f4` : `${lang}+f3`;
    const pitch = this.voiceAlertStyle === 'anime' ? 92 : 50;
    const speed = 130; // Tempo santai layaknya manusia

    const userEnv = `XDG_RUNTIME_DIR=/run/user/${realUid} PULSE_SERVER=unix:/run/user/${realUid}/pulse/native`;
    const cmd = `espeak -v ${voiceVariant} -p ${pitch} -s ${speed} "${safeText}" --stdout 2>/dev/null | aplay -D plughw:1,0 -q 2>/dev/null || ` +
                `espeak -v ${voiceVariant} -p ${pitch} -s ${speed} "${safeText}" --stdout 2>/dev/null | aplay -D plughw:0,0 -q 2>/dev/null || ` +
                `espeak -v ${voiceVariant} -p ${pitch} -s ${speed} "${safeText}" --stdout 2>/dev/null | aplay -q 2>/dev/null || ` +
                `espeak -v ${voiceVariant} -p ${pitch} -s ${speed} "${safeText}" --stdout 2>/dev/null | sudo -u ${realUser} ${userEnv} aplay -q 2>/dev/null`;

    exec(cmd, () => {});
  }

  // ─────────────────────────────────────────
  // Alert: New unknown device
  // ─────────────────────────────────────────
  async _alertNewDevice(device) {
    if (!this.alertsEnabled) return;
    
    const totalOnline = this.db.getOnlineDevices().length;

    // Gather signal/location data for this device
    let signalInfo = null;
    if (this.signalTracker) {
      try {
        signalInfo = await this.signalTracker.getDeviceSignal(device);
      } catch (error) {
        console.log('⚠️  Signal tracking error for new device:', error.message);
      }
    }

    const text = this.formatter.formatNewDeviceAlert(device, totalOnline, signalInfo);
    
    console.log(`🚨 ALERT: New device ${device.mac} (${device.vendor})`);
    
    if (this.voiceAlertOnNewDevice) {
      const devName = this._getReadableDeviceName(device);
      let voiceMsg = `Perhatian. Terdeteksi perangkat baru memasuki jaringan Wi-Fi, yaitu ${devName}. Harap periksa keamanan jaringan Anda.`;
      
      // Add location info to voice alert
      if (signalInfo && signalInfo.zone) {
        voiceMsg += ` Estimasi lokasi: ${signalInfo.zone.label}.`;
      }

      if (this.voiceAlertStyle === 'anime') {
        voiceMsg = `Moshi moshi! Peringatan Onii-chan! Perangkat baru terdeteksi di Wi-Fi! Yaitu ${devName}!`;
        if (signalInfo && signalInfo.zone) {
          voiceMsg += ` Lokasi estimasi: ${signalInfo.zone.label}!`;
        }
      } else if (this.voiceAlertStyle === 'human') {
        voiceMsg = `Peringatan. Perangkat baru terdeteksi di jaringan Wi-Fi, yaitu ${devName}.`;
        if (signalInfo && signalInfo.zone) {
          voiceMsg += ` Estimasi berada di zona ${signalInfo.zone.label}.`;
        }
      }

      await this.speakVoiceAlert(voiceMsg);
    }

    await this.waClient.sendAlert(text);
  }

  // ─────────────────────────────────────────
  // Alert: Device reconnected
  // ─────────────────────────────────────────
  async _alertReconnect(device) {
    if (!this.alertsEnabled) return;
    
    const totalOnline = this.db.getOnlineDevices().length;
    const text = this.formatter.formatReconnectAlert(device, totalOnline);
    
    console.log(`🔄 RECONNECT ALERT: ${device.mac} (${device.vendor || 'Unknown'})`);
    
    if (this.voiceAlertOnReconnect) {
      const devName = this._getReadableDeviceName(device);
      let voiceMsg = `Informasi. Perangkat ${devName} baru saja terhubung kembali ke jaringan Wi-Fi.`;

      if (this.voiceAlertStyle === 'anime') {
        voiceMsg = `Ara ara~ Perangkat ${devName} terhubung kembali ke Wi-Fi, Senpai!`;
      } else if (this.voiceAlertStyle === 'human') {
        voiceMsg = `Perangkat ${devName} terhubung kembali ke jaringan Wi-Fi.`;
      }

      await this.speakVoiceAlert(voiceMsg);
    }

    await this.waClient.sendAlert(text);
  }

  // ─────────────────────────────────────────
  // Alert: Device disconnected
  // ─────────────────────────────────────────
  async _alertDisconnect(device) {
    if (!this.alertsEnabled) return;
    
    const totalOnline = this.db.getOnlineDevices().length;
    const text = this.formatter.formatDisconnectAlert(device, totalOnline);
    
    if (this.voiceAlertOnDisconnect) {
      const devName = this._getReadableDeviceName(device);
      let voiceMsg = `Informasi. Perangkat ${devName} telah terputus dari jaringan Wi-Fi.`;

      if (this.voiceAlertStyle === 'anime') {
        voiceMsg = `Perangkat ${devName} sudah terputus dari Wi-Fi, Senpai!`;
      } else if (this.voiceAlertStyle === 'human') {
        voiceMsg = `Perangkat ${devName} terputus dari jaringan Wi-Fi.`;
      }

      await this.speakVoiceAlert(voiceMsg);
    }

    await this.waClient.sendAlert(text);
  }

  // ─────────────────────────────────────────
  // Alert: Suspicious activity
  // ─────────────────────────────────────────
  async _alertSuspicious(device, reason) {
    if (!this.alertsEnabled) return;
    
    const text = this.formatter.formatSuspiciousAlert(device, reason);
    
    console.log(`⚠️  SUSPICIOUS: ${device.mac} — ${reason}`);
    await this.waClient.sendAlert(text);
  }

  // ─────────────────────────────────────────
  // Send daily report
  // ─────────────────────────────────────────
  async sendDailyReport() {
    try {
      const stats = this.db.getStats();
      const onlineDevices = this.db.getOnlineDevices();
      const unknownDevices = this.db.getDevicesByTrust('unknown');
      
      const text = this.formatter.formatDailyReport(stats, onlineDevices, unknownDevices);
      
      console.log('📊 Sending daily report...');
      await this.waClient.sendAlert(text);
    } catch (error) {
      console.error('❌ Daily report error:', error.message);
    }
  }
}

module.exports = AlertEngine;
