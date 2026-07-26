// ═══════════════════════════════════════════════════════════════
// 🧠 Device Identifier — WiFi Guard Bot
// Identifikasi vendor, tipe perangkat, dan threat level
// ═══════════════════════════════════════════════════════════════

let ouiLookup;
try {
  ouiLookup = require('oui');
} catch {
  ouiLookup = null;
}

class DeviceIdentifier {
  constructor() {
    // Known vendor → device type mappings
    this.vendorTypeMap = {
      // Smartphones
      'apple': 'smartphone', 'samsung': 'smartphone', 'xiaomi': 'smartphone',
      'huawei': 'smartphone', 'oppo': 'smartphone', 'vivo': 'smartphone',
      'oneplus': 'smartphone', 'realme': 'smartphone', 'motorola': 'smartphone',
      'nokia': 'smartphone', 'sony mobile': 'smartphone', 'google': 'smartphone',
      'zte': 'smartphone', 'lenovo': 'smartphone', 'lg electronics': 'smartphone',
      'infinix': 'smartphone', 'tecno': 'smartphone', 'itel': 'smartphone',

      // Laptops / PCs
      'dell': 'laptop', 'hewlett packard': 'laptop', 'hp inc': 'laptop',
      'acer': 'laptop', 'asus': 'laptop', 'msi': 'laptop',
      'toshiba': 'laptop', 'microsoft': 'laptop', 'intel': 'desktop',
      'gigabyte': 'desktop', 'asrock': 'desktop',

      // Network Equipment
      'tp-link': 'router', 'netgear': 'router', 'd-link': 'router',
      'zyxel': 'router', 'ubiquiti': 'router', 'mikrotik': 'router',
      'cisco': 'router', 'linksys': 'router', 'tenda': 'router',
      'huawei technologies': 'router', 'aruba': 'access_point',

      // IoT / Smart Home
      'espressif': 'iot', 'tuya': 'iot', 'shenzhen': 'iot',
      'amazon': 'smart_speaker', 'sonos': 'smart_speaker',
      'google llc': 'smart_speaker', 'ring': 'camera',
      'hikvision': 'camera', 'dahua': 'camera', 'wyze': 'camera',

      // TV / Entertainment
      'roku': 'smart_tv', 'tcl': 'smart_tv', 'lg display': 'smart_tv',
      'vizio': 'smart_tv', 'chromecast': 'streaming',

      // Printers
      'brother': 'printer', 'canon': 'printer', 'epson': 'printer',
      'ricoh': 'printer', 'xerox': 'printer',

      // Gaming
      'nintendo': 'gaming', 'sony interactive': 'gaming',
      'valve': 'gaming', 'steam': 'gaming',
    };

    // Device type → emoji icon mapping
    this.deviceIcons = {
      'smartphone': '📱', 'laptop': '💻', 'desktop': '🖥️',
      'tablet': '📱', 'router': '📡', 'access_point': '📶',
      'smart_tv': '📺', 'streaming': '🎬', 'smart_speaker': '🔊',
      'camera': '📷', 'printer': '🖨️', 'iot': '🔌',
      'gaming': '🎮', 'wearable': '⌚', 'unknown': '❓',
    };

    // Device type labels (Indonesian)
    this.deviceLabels = {
      'smartphone': 'Smartphone', 'laptop': 'Laptop', 'desktop': 'Desktop PC',
      'tablet': 'Tablet', 'router': 'Router/AP', 'access_point': 'Access Point',
      'smart_tv': 'Smart TV', 'streaming': 'Streaming Device', 'smart_speaker': 'Smart Speaker',
      'camera': 'IP Camera', 'printer': 'Printer', 'iot': 'IoT Device',
      'gaming': 'Game Console', 'wearable': 'Wearable', 'unknown': 'Tidak Diketahui',
    };
  }

  // Helper to check if MAC address is locally administered (randomized for privacy)
  isRandomizedMAC(mac) {
    if (!mac) return false;
    const firstByte = parseInt(mac.split(':')[0], 16);
    return (firstByte & 2) !== 0;
  }

  // ─────────────────────────────────────────
  // Lookup vendor from MAC address using OUI database
  // ─────────────────────────────────────────
  lookupVendor(mac) {
    if (!mac) return 'Unknown';

    // Try oui library
    if (ouiLookup) {
      try {
        const result = ouiLookup(mac);
        if (result) {
          // Extract first line (company name)
          const firstLine = result.split('\n')[0].trim();
          if (firstLine && !firstLine.includes('Unknown')) return firstLine;
        }
      } catch {}
    }

    if (this.isRandomizedMAC(mac)) {
      return 'Private MAC (Randomized)';
    }

    return 'Unknown';
  }

  // ─────────────────────────────────────────
  // Classify device type based on vendor, hostname, and OS
  // ─────────────────────────────────────────
  classifyDevice(vendor = '', hostname = '', os = '', mac = '') {
    const lowerVendor = (vendor || '').toLowerCase();
    const lowerHostname = (hostname || '').toLowerCase();
    const lowerOs = (os || '').toLowerCase();

    // 1. Check OS first (most reliable)
    if (lowerOs.includes('android') || lowerOs.includes('ios')) return 'smartphone';
    if (lowerOs.includes('windows') || lowerOs.includes('macos') || lowerOs.includes('linux')) return 'laptop';

    // 2. Check hostname patterns
    if (lowerHostname.match(/iphone|ipad|galaxy|redmi|poco|pixel|oneplus|realme|oppo|vivo|android|mobile/)) return 'smartphone';
    if (lowerHostname.match(/macbook|laptop|notebook|thinkpad|ideapad|pavilion|inspiron/)) return 'laptop';
    if (lowerHostname.match(/desktop|pc-|workstation/)) return 'desktop';
    if (lowerHostname.match(/ipad|tab-|tablet/)) return 'tablet';
    if (lowerHostname.match(/router|gateway|ap-|access/)) return 'router';
    if (lowerHostname.match(/tv|smart-tv|roku|chromecast|firestick/)) return 'smart_tv';
    if (lowerHostname.match(/printer|epson|canon|brother/)) return 'printer';
    if (lowerHostname.match(/camera|cam-|ipcam|hikvision/)) return 'camera';
    if (lowerHostname.match(/echo|alexa|google-home|homepod/)) return 'smart_speaker';
    if (lowerHostname.match(/esp|tasmota|sonoff|tuya|smart-plug|smart-bulb/)) return 'iot';
    if (lowerHostname.match(/switch|playstation|ps[345]|xbox/)) return 'gaming';
    if (lowerHostname.match(/watch|band|fitbit/)) return 'wearable';

    // 3. Check vendor
    for (const [keyword, type] of Object.entries(this.vendorTypeMap)) {
      if (lowerVendor.includes(keyword)) return type;
    }

    // 4. If randomized MAC (standard for modern Android/iOS Wi-Fi MAC privacy)
    if (this.isRandomizedMAC(mac) || lowerVendor.includes('private mac')) {
      return 'smartphone';
    }

    return 'unknown';
  }

  // ─────────────────────────────────────────
  // Get emoji icon for device type
  // ─────────────────────────────────────────
  getDeviceIcon(type) {
    return this.deviceIcons[type] || '❓';
  }

  // ─────────────────────────────────────────
  // Get human label for device type
  // ─────────────────────────────────────────
  getDeviceLabel(type) {
    return this.deviceLabels[type] || 'Tidak Diketahui';
  }

  // ─────────────────────────────────────────
  // Build full device profile
  // ─────────────────────────────────────────
  identifyDevice(rawDevice) {
    let vendor = rawDevice.vendor;
    if (!vendor || vendor === 'Unknown' || vendor.includes('locally administered')) {
      vendor = this.lookupVendor(rawDevice.mac);
    }

    const type = this.classifyDevice(
      vendor,
      rawDevice.hostname || '',
      rawDevice.os || '',
      rawDevice.mac || ''
    );

    return {
      ip: rawDevice.ip,
      mac: rawDevice.mac,
      vendor: vendor,
      nmapVendor: rawDevice.nmapVendor || null,
      hostname: rawDevice.hostname || null,
      os: rawDevice.os || null,
      type: type,
      icon: this.getDeviceIcon(type),
      label: this.getDeviceLabel(type),
    };
  }

  // ─────────────────────────────────────────
  // Assess threat level
  // ─────────────────────────────────────────
  assessThreat(device, db) {
    if (!db) return 'unknown';

    const existingDevice = db.getDeviceByMAC(device.mac);

    if (!existingDevice) {
      return 'unknown'; // Never seen before
    }

    if (existingDevice.trust_level === 'trusted') {
      return 'trusted';
    }

    if (existingDevice.trust_level === 'blocked') {
      return 'suspicious';
    }

    // Check for suspicious patterns
    if (this._checkSuspicious(device, existingDevice)) {
      return 'suspicious';
    }

    return 'known';
  }

  // ─────────────────────────────────────────
  // Check for suspicious behavior
  // ─────────────────────────────────────────
  _checkSuspicious(newDevice, existingDevice) {
    // MAC address reuse with different vendor (possible MAC spoofing)
    if (existingDevice.vendor && newDevice.vendor &&
        existingDevice.vendor !== 'Unknown' && newDevice.vendor !== 'Unknown' &&
        existingDevice.vendor !== newDevice.vendor) {
      return true;
    }

    // Rapid reconnections (more than 10 times in last hour)
    // This would need connection log analysis — handled by alert engine

    return false;
  }

  // ─────────────────────────────────────────
  // Get threat emoji
  // ─────────────────────────────────────────
  getThreatEmoji(level) {
    const emojis = {
      'trusted': '🟢',
      'known': '🟡',
      'unknown': '🔴',
      'suspicious': '⚠️',
      'blocked': '🚫',
    };
    return emojis[level] || '❓';
  }

  getThreatLabel(level) {
    const labels = {
      'trusted': 'TRUSTED',
      'known': 'KNOWN',
      'unknown': 'UNKNOWN',
      'suspicious': 'SUSPICIOUS',
      'blocked': 'BLOCKED',
    };
    return labels[level] || 'UNKNOWN';
  }
}

module.exports = DeviceIdentifier;
