// ═══════════════════════════════════════════════════════════════
// 🔍 Network Scanner — WiFi Guard Bot
// Scan jaringan menggunakan arp-scan dan nmap
// ═══════════════════════════════════════════════════════════════

const { exec } = require('child_process');
const os = require('os');

class NetworkScanner {
  constructor(config = {}) {
    this.interface = config.interface || null;
    this.subnet = config.subnet || null;
    this.deepScanEnabled = config.deepScanEnabled !== false;
    this._cachedInterface = null;
    this._cachedSubnet = null;
  }

  // ─────────────────────────────────────────
  // Auto-detect active network interface
  // ─────────────────────────────────────────
  getNetworkInterface() {
    if (this.interface) return this.interface;
    if (this._cachedInterface) return this._cachedInterface;

    const interfaces = os.networkInterfaces();
    
    // Priority: wlan > wlp > eth > end > en > br > usb
    const priorities = ['wlan', 'wlp', 'eth', 'end', 'en', 'br', 'usb'];
    
    for (const prefix of priorities) {
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (name.startsWith(prefix)) {
          const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
          if (ipv4) {
            this._cachedInterface = name;
            return name;
          }
        }
      }
    }

    // Fallback: any non-internal IPv4 interface
    for (const [name, addrs] of Object.entries(interfaces)) {
      const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
      if (ipv4) {
        this._cachedInterface = name;
        return name;
      }
    }

    throw new Error('❌ Tidak dapat menemukan network interface aktif');
  }

  // ─────────────────────────────────────────
  // Get local IP and subnet
  // ─────────────────────────────────────────
  getLocalIP() {
    const iface = this.getNetworkInterface();
    const interfaces = os.networkInterfaces();
    const addrs = interfaces[iface];
    if (!addrs) return null;
    const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
    return ipv4 ? ipv4.address : null;
  }

  getSubnet() {
    if (this.subnet) return this.subnet;
    if (this._cachedSubnet) return this._cachedSubnet;

    const ip = this.getLocalIP();
    if (!ip) throw new Error('❌ Tidak dapat menentukan IP lokal');

    // Assume /24 subnet (most common for home WiFi)
    const parts = ip.split('.');
    parts[3] = '0';
    this._cachedSubnet = parts.join('.') + '/24';
    return this._cachedSubnet;
  }

  // ─────────────────────────────────────────
  // Execute shell command with promise
  // ─────────────────────────────────────────
  _exec(command, timeout = 30000) {
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

  // ─────────────────────────────────────────
  // Fast scan using arp-scan
  // ─────────────────────────────────────────
  async scanWithArp() {
    const iface = this.getNetworkInterface();
    const subnet = this.getSubnet();
    
    try {
      const output = await this._exec(
        `sudo arp-scan --interface=${iface} ${subnet} --retry=2 --timeout=500 2>/dev/null`
      );
      return this._parseArpOutput(output);
    } catch (error) {
      // Fallback: read ARP table directly
      console.log('⚠️  arp-scan gagal, menggunakan ARP table fallback...');
      return this._scanFromArpTable();
    }
  }

  // ─────────────────────────────────────────
  // Parse arp-scan output
  // ─────────────────────────────────────────
  _parseArpOutput(output) {
    const devices = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match lines like: 192.168.1.1	aa:bb:cc:dd:ee:ff	Vendor Name
      const match = line.match(
        /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([\da-fA-F:]{17})\s+(.*)$/
      );
      if (match) {
        devices.push({
          ip: match[1],
          mac: match[2].toUpperCase(),
          vendor: match[3].trim() || 'Unknown',
          source: 'arp-scan'
        });
      }
    }

    return devices;
  }

  // ─────────────────────────────────────────
  // Fallback: Read /proc/net/arp
  // ─────────────────────────────────────────
  async _scanFromArpTable() {
    try {
      // First, ping sweep to populate ARP table
      const subnet = this.getSubnet();
      const baseIP = subnet.replace('/24', '');
      const base = baseIP.split('.').slice(0, 3).join('.');
      
      // Quick ping sweep (background, don't wait for all)
      const pingPromises = [];
      for (let i = 1; i <= 254; i++) {
        pingPromises.push(
          this._exec(`ping -c 1 -W 1 ${base}.${i} 2>/dev/null`, 2000).catch(() => {})
        );
      }
      
      // Wait for pings (with timeout)
      await Promise.race([
        Promise.allSettled(pingPromises),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      // Read ARP table
      const output = await this._exec('cat /proc/net/arp');
      return this._parseArpTable(output);
    } catch (error) {
      console.error('❌ ARP table fallback gagal:', error.message);
      return [];
    }
  }

  _parseArpTable(output) {
    const devices = [];
    const lines = output.split('\n');

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 4 && parts[2] !== '0x0' && parts[3] !== '00:00:00:00:00:00') {
        devices.push({
          ip: parts[0],
          mac: parts[3].toUpperCase(),
          vendor: 'Unknown',
          source: 'arp-table'
        });
      }
    }

    return devices;
  }

  // ─────────────────────────────────────────
  // Deep scan using nmap (OS detection, hostname, ports)
  // ─────────────────────────────────────────
  async scanWithNmap() {
    if (!this.deepScanEnabled) return [];

    const subnet = this.getSubnet();
    
    try {
      // -sn: Ping scan (no port scan, faster)
      // -O: OS detection
      // --host-timeout: Max time per host
      const output = await this._exec(
        `sudo nmap -sn -O --host-timeout 10s ${subnet} 2>/dev/null`,
        60000
      );
      return this._parseNmapOutput(output);
    } catch (error) {
      // Simpler nmap scan without OS detection
      try {
        const output = await this._exec(
          `sudo nmap -sn ${subnet} 2>/dev/null`,
          30000
        );
        return this._parseNmapSimpleOutput(output);
      } catch (err) {
        console.log('⚠️  nmap scan gagal:', err.message);
        return [];
      }
    }
  }

  // ─────────────────────────────────────────
  // Parse nmap output (with OS detection)
  // ─────────────────────────────────────────
  _parseNmapOutput(output) {
    const devices = [];
    const blocks = output.split('Nmap scan report for ');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const device = {};

      // Extract hostname and IP
      const headerMatch = block.match(/^(.+?)\s*\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/);
      const ipOnlyMatch = block.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      
      if (headerMatch) {
        device.hostname = headerMatch[1].trim();
        device.ip = headerMatch[2];
      } else if (ipOnlyMatch) {
        device.ip = ipOnlyMatch[1];
        device.hostname = null;
      } else {
        continue;
      }

      // Extract MAC address
      const macMatch = block.match(/MAC Address:\s+([\dA-Fa-f:]{17})\s+\((.+?)\)/);
      if (macMatch) {
        device.mac = macMatch[1].toUpperCase();
        device.nmapVendor = macMatch[2];
      }

      // Extract OS
      const osMatch = block.match(/OS details?:\s+(.+)/);
      if (osMatch) {
        device.os = osMatch[1].trim();
      }

      // Aggressive OS guesses
      const aggressiveOsMatch = block.match(/Aggressive OS guesses?:\s+(.+)/);
      if (!device.os && aggressiveOsMatch) {
        device.os = aggressiveOsMatch[1].split(',')[0].trim();
      }

      if (device.ip && device.mac) {
        device.source = 'nmap';
        devices.push(device);
      }
    }

    return devices;
  }

  // ─────────────────────────────────────────
  // Parse simple nmap output (ping scan only)
  // ─────────────────────────────────────────
  _parseNmapSimpleOutput(output) {
    const devices = [];
    const blocks = output.split('Nmap scan report for ');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const device = {};

      const headerMatch = block.match(/^(.+?)\s*\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/);
      const ipOnlyMatch = block.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      
      if (headerMatch) {
        device.hostname = headerMatch[1].trim();
        device.ip = headerMatch[2];
      } else if (ipOnlyMatch) {
        device.ip = ipOnlyMatch[1];
      } else {
        continue;
      }

      const macMatch = block.match(/MAC Address:\s+([\dA-Fa-f:]{17})\s+\((.+?)\)/);
      if (macMatch) {
        device.mac = macMatch[1].toUpperCase();
        device.nmapVendor = macMatch[2];
      }

      if (device.ip && device.mac) {
        device.source = 'nmap';
        devices.push(device);
      }
    }

    return devices;
  }

  // ─────────────────────────────────────────
  // Instant parallel DNS reverse lookup for hostnames
  // ─────────────────────────────────────────
  async resolveHostnames(devices) {
    const dns = require('dns').promises;
    await Promise.all(
      devices.map(async (d) => {
        if (!d.hostname && d.ip) {
          try {
            const names = await Promise.race([
              dns.reverse(d.ip),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 250))
            ]);
            if (names && names.length > 0 && names[0]) {
              d.hostname = names[0];
            }
          } catch {}
        }
      })
    );
    return devices;
  }

  // ─────────────────────────────────────────
  // Combined scan: arp-scan + instant DNS resolve
  // ─────────────────────────────────────────
  async fullScan() {
    const startTime = Date.now();
    
    // Run arp-scan first (fast)
    const arpDevices = await this.scanWithArp();
    
    // Resolve DNS hostnames instantly in parallel (<20ms)
    await this.resolveHostnames(arpDevices);

    // Merge results by MAC address
    const deviceMap = new Map();

    for (const device of arpDevices) {
      deviceMap.set(device.mac, { ...device });
    }

    const elapsed = Date.now() - startTime;
    const localIP = this.getLocalIP();
    
    return {
      devices: Array.from(deviceMap.values()),
      scanTime: elapsed,
      timestamp: new Date().toISOString(),
      interface: this.getNetworkInterface(),
      subnet: this.getSubnet(),
      localIP
    };
  }

  // ─────────────────────────────────────────
  // Deep scan: enrich existing devices with nmap data
  // ─────────────────────────────────────────
  async deepScan(existingDevices = []) {
    const nmapDevices = await this.scanWithNmap();
    const enriched = [...existingDevices];

    for (const nmapDevice of nmapDevices) {
      const existing = enriched.find(d => d.mac === nmapDevice.mac);
      if (existing) {
        // Merge nmap data into existing
        if (nmapDevice.hostname) existing.hostname = nmapDevice.hostname;
        if (nmapDevice.os) existing.os = nmapDevice.os;
        if (nmapDevice.nmapVendor) existing.nmapVendor = nmapDevice.nmapVendor;
      } else {
        enriched.push(nmapDevice);
      }
    }

    return enriched;
  }

  // ─────────────────────────────────────────
  // Get system info
  // ─────────────────────────────────────────
  getSystemInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      interface: this.getNetworkInterface(),
      localIP: this.getLocalIP(),
      subnet: this.getSubnet(),
      uptime: os.uptime()
    };
  }

  // ─────────────────────────────────────────
  // Check if required tools are installed
  // ─────────────────────────────────────────
  async checkDependencies() {
    const results = { arpScan: false, nmap: false };

    try {
      await this._exec('which arp-scan');
      results.arpScan = true;
    } catch {}

    try {
      await this._exec('which nmap');
      results.nmap = true;
    } catch {}

    return results;
  }
}

module.exports = NetworkScanner;
