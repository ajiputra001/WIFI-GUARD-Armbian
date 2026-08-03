// ═══════════════════════════════════════════════════════════════
// 📡 Signal Tracker — WiFi Guard Bot v2.0
// Track RSSI signal strength & estimate device proximity/location
// Works via iw scan, arping RTT, or passive ARP analysis
// ═══════════════════════════════════════════════════════════════

const { exec } = require('child_process');
const os = require('os');

class SignalTracker {
  constructor(config = {}) {
    this.interface = config.interface || null;
    this.wifiInterface = config.wifiInterface || null; // Separate WiFi iface for scanning
    this._signalCache = new Map(); // MAC → { rssi, timestamp, quality, zone, distance }
    this._cacheTTL = 30000; // 30 seconds cache
    this._hasWifi = null;
  }

  // ─────────────────────────────────────────
  // Initialize: detect WiFi interface
  // ─────────────────────────────────────────
  async initialize() {
    // Detect WiFi interface (even if STB is on LAN, it might have a WiFi adapter)
    if (!this.wifiInterface) {
      this.wifiInterface = await this._detectWifiInterface();
    }

    if (this.wifiInterface) {
      this._hasWifi = true;
      console.log(`📡 SignalTracker: WiFi interface detected → ${this.wifiInterface}`);
    } else {
      this._hasWifi = false;
      console.log('📡 SignalTracker: No WiFi interface found, using ping RTT estimation mode');
    }

    return this;
  }

  // ─────────────────────────────────────────
  // Detect WiFi interface
  // ─────────────────────────────────────────
  async _detectWifiInterface() {
    const interfaces = os.networkInterfaces();
    const wifiPrefixes = ['wlan', 'wlp', 'wlx'];

    for (const prefix of wifiPrefixes) {
      for (const name of Object.keys(interfaces)) {
        if (name.startsWith(prefix)) {
          return name;
        }
      }
    }

    // Check /sys/class/net for wireless devices
    try {
      const output = await this._exec('ls /sys/class/net/*/wireless 2>/dev/null | cut -d/ -f5');
      const iface = output.trim().split('\n')[0];
      if (iface) return iface;
    } catch {}

    return null;
  }

  // ─────────────────────────────────────────
  // Get RSSI for all connected devices (via iw station dump)
  // Only works if STB runs as AP or has WiFi interface in managed mode
  // ─────────────────────────────────────────
  async getStationSignals() {
    if (!this._hasWifi) return new Map();

    try {
      const output = await this._exec(`sudo iw dev ${this.wifiInterface} station dump 2>/dev/null`);
      return this._parseStationDump(output);
    } catch {
      return new Map();
    }
  }

  // ─────────────────────────────────────────
  // Parse `iw station dump` output
  // ─────────────────────────────────────────
  _parseStationDump(output) {
    const signals = new Map();
    const blocks = output.split('Station ');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const macMatch = block.match(/^([0-9a-fA-F:]{17})/);
      if (!macMatch) continue;

      const mac = macMatch[1].toUpperCase();
      const rssiMatch = block.match(/signal:\s*(-?\d+)\s*dBm/);
      const txMatch = block.match(/tx bitrate:\s*(\d+\.?\d*)\s*MBit/);
      const rxMatch = block.match(/rx bitrate:\s*(\d+\.?\d*)\s*MBit/);
      const connTimeMatch = block.match(/connected time:\s*(\d+)\s*seconds/);

      if (rssiMatch) {
        const rssi = parseInt(rssiMatch[1]);
        signals.set(mac, {
          rssi,
          txBitrate: txMatch ? parseFloat(txMatch[1]) : null,
          rxBitrate: rxMatch ? parseFloat(rxMatch[1]) : null,
          connectedTime: connTimeMatch ? parseInt(connTimeMatch[1]) : null,
          quality: this.getSignalQuality(rssi),
          zone: this.classifyZone(rssi),
          distance: this.estimateDistance(rssi),
          source: 'iw-station',
          timestamp: Date.now(),
        });
      }
    }

    return signals;
  }

  // ─────────────────────────────────────────
  // Get RSSI via iw scan (passive WiFi scan for nearby devices)
  // ─────────────────────────────────────────
  async getScanSignals() {
    if (!this._hasWifi) return new Map();

    try {
      // Trigger a scan
      await this._exec(`sudo iw dev ${this.wifiInterface} scan trigger 2>/dev/null`);
      await new Promise(r => setTimeout(r, 2000));

      const output = await this._exec(`sudo iw dev ${this.wifiInterface} scan dump 2>/dev/null`);
      return this._parseScanDump(output);
    } catch {
      return new Map();
    }
  }

  // ─────────────────────────────────────────
  // Parse `iw scan dump` output for nearby BSSIDs
  // ─────────────────────────────────────────
  _parseScanDump(output) {
    const signals = new Map();
    const blocks = output.split('BSS ');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const macMatch = block.match(/^([0-9a-fA-F:]{17})/);
      if (!macMatch) continue;

      const mac = macMatch[1].toUpperCase();
      const rssiMatch = block.match(/signal:\s*(-?\d+\.?\d*)\s*dBm/);
      const ssidMatch = block.match(/SSID:\s*(.+)/);

      if (rssiMatch) {
        const rssi = Math.round(parseFloat(rssiMatch[1]));
        signals.set(mac, {
          rssi,
          ssid: ssidMatch ? ssidMatch[1].trim() : null,
          quality: this.getSignalQuality(rssi),
          zone: this.classifyZone(rssi),
          distance: this.estimateDistance(rssi),
          source: 'iw-scan',
          timestamp: Date.now(),
        });
      }
    }

    return signals;
  }

  // ─────────────────────────────────────────
  // Estimate proximity using arping round-trip time (RTT)
  // Works even without WiFi interface (LAN-connected STB)
  // ─────────────────────────────────────────
  async getProximityByPing(ip) {
    try {
      // Use arping for more accurate LAN RTT measurement
      let output;
      try {
        output = await this._exec(`sudo arping -c 3 -w 2 ${ip} 2>/dev/null`, 5000);
      } catch {
        // Fallback to regular ping
        output = await this._exec(`ping -c 3 -W 1 ${ip} 2>/dev/null`, 5000);
      }

      const rttMatch = output.match(/min\/avg\/max.*?=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (rttMatch) {
        const avgRtt = parseFloat(rttMatch[2]);
        return {
          rtt: avgRtt,
          zone: this._classifyByRTT(avgRtt),
          quality: this._rttToQuality(avgRtt),
          source: 'ping-rtt',
          timestamp: Date.now(),
        };
      }

      // Try parsing arping format
      const arpRttMatches = [...output.matchAll(/time[= ]([\d.]+)\s*m?s/gi)];
      if (arpRttMatches.length > 0) {
        const rtts = arpRttMatches.map(m => parseFloat(m[1]));
        const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        return {
          rtt: avgRtt,
          zone: this._classifyByRTT(avgRtt),
          quality: this._rttToQuality(avgRtt),
          source: 'arping-rtt',
          timestamp: Date.now(),
        };
      }
    } catch {}

    return null;
  }

  // ─────────────────────────────────────────
  // Get signal/proximity for all online devices
  // ─────────────────────────────────────────
  async getAllDeviceSignals(onlineDevices = []) {
    const results = new Map();

    // Method 1: Try iw station dump (best — direct RSSI)
    const stationSignals = await this.getStationSignals();
    for (const [mac, signal] of stationSignals) {
      results.set(mac, signal);
    }

    // Method 2: For devices not found in station dump, use ping RTT
    for (const device of onlineDevices) {
      const mac = device.mac || device.MAC;
      if (!results.has(mac) && device.ip) {
        // Check cache first
        const cached = this._signalCache.get(mac);
        if (cached && (Date.now() - cached.timestamp) < this._cacheTTL) {
          results.set(mac, cached);
          continue;
        }

        const pingResult = await this.getProximityByPing(device.ip);
        if (pingResult) {
          results.set(mac, pingResult);
          this._signalCache.set(mac, pingResult);
        }
      }
    }

    return results;
  }

  // ─────────────────────────────────────────
  // Get signal info for a single device
  // ─────────────────────────────────────────
  async getDeviceSignal(device) {
    if (!device) return null;

    const mac = device.mac || device.MAC;

    // Try station dump first
    const stationSignals = await this.getStationSignals();
    if (stationSignals.has(mac)) {
      return stationSignals.get(mac);
    }

    // Fallback to ping RTT
    if (device.ip) {
      return await this.getProximityByPing(device.ip);
    }

    return null;
  }

  // ═══════════════════════════════════════════
  // Signal Analysis Functions
  // ═══════════════════════════════════════════

  // Estimate distance from RSSI using Free-Space Path Loss model
  // RSSI → estimated meters (2.4GHz WiFi)
  estimateDistance(rssi) {
    if (!rssi || rssi >= 0) return null;

    // FSPL formula: distance = 10^((27.55 - (20*log10(freq)) + |RSSI|) / 20)
    // For 2.4GHz WiFi (freq = 2437 MHz):
    const txPower = -20; // Typical reference at 1m
    const n = 2.7; // Path loss exponent (indoor environment)
    const distance = Math.pow(10, (Math.abs(rssi) - Math.abs(txPower)) / (10 * n));

    return Math.round(distance * 10) / 10; // Round to 1 decimal
  }

  // Classify zone based on RSSI
  classifyZone(rssi) {
    if (!rssi || rssi >= 0) return { label: 'TIDAK DIKETAHUI', emoji: '❓', description: 'Signal tidak terdeteksi' };

    if (rssi >= -30) {
      return { label: 'SANGAT DEKAT', emoji: '🔴', description: 'Di ruangan yang sama (< 1m)', level: 5 };
    } else if (rssi >= -50) {
      return { label: 'DEKAT', emoji: '🟠', description: 'Di ruangan sebelah (1-5m)', level: 4 };
    } else if (rssi >= -65) {
      return { label: 'SEDANG', emoji: '🟡', description: 'Di dalam rumah/gedung (5-15m)', level: 3 };
    } else if (rssi >= -80) {
      return { label: 'JAUH', emoji: '🔵', description: 'Di luar rumah / tetangga (15-30m)', level: 2 };
    } else {
      return { label: 'SANGAT JAUH', emoji: '⚪', description: 'Dari jalan / gedung lain (>30m)', level: 1 };
    }
  }

  // Classify zone based on ping RTT (for LAN-connected STB)
  _classifyByRTT(rttMs) {
    if (rttMs < 1) {
      return { label: 'SANGAT DEKAT', emoji: '🔴', description: 'Terhubung langsung / kabel (< 1ms)', level: 5 };
    } else if (rttMs < 5) {
      return { label: 'DEKAT', emoji: '🟠', description: 'WiFi jarak dekat (1-5ms)', level: 4 };
    } else if (rttMs < 20) {
      return { label: 'SEDANG', emoji: '🟡', description: 'WiFi jarak menengah (5-20ms)', level: 3 };
    } else if (rttMs < 100) {
      return { label: 'JAUH', emoji: '🔵', description: 'WiFi jarak jauh / koneksi lambat (20-100ms)', level: 2 };
    } else {
      return { label: 'SANGAT JAUH', emoji: '⚪', description: 'Koneksi sangat lambat / tidak stabil (>100ms)', level: 1 };
    }
  }

  // Get signal quality percentage (for RSSI)
  getSignalQuality(rssi) {
    if (!rssi || rssi >= 0) return 0;

    // Map -30dBm → 100%, -90dBm → 0%
    const quality = Math.min(100, Math.max(0, ((rssi + 90) / 60) * 100));
    return Math.round(quality);
  }

  // Get signal quality from RTT
  _rttToQuality(rttMs) {
    // Map 0ms → 100%, 200ms → 0%
    const quality = Math.min(100, Math.max(0, ((200 - rttMs) / 200) * 100));
    return Math.round(quality);
  }

  // Get visual signal bar
  getSignalBar(qualityPercent) {
    const totalBars = 10;
    const filled = Math.round((qualityPercent / 100) * totalBars);
    const empty = totalBars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  // ─────────────────────────────────────────
  // Execute shell command
  // ─────────────────────────────────────────
  _exec(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(error);
        } else {
          resolve(stdout || '');
        }
      });
    });
  }
}

module.exports = SignalTracker;
