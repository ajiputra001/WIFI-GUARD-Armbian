// ═══════════════════════════════════════════════════════════════
// 🔥 IP Firewall — WiFi Guard Bot v2.0
// Block/Unblock perangkat via ARP Spoofing + iptables
// Efektif walau STB bukan router (teknik NetCut/WiFi Kill)
// ═══════════════════════════════════════════════════════════════

const { exec, spawn } = require('child_process');

class IPFirewall {
  constructor(config = {}) {
    this.interface = config.interface || null;
    this.gatewayIP = config.gatewayIP || null;
    this._blockedProcesses = new Map(); // MAC → { process, ip }
    this._initialized = false;
  }

  // ─────────────────────────────────────────
  // Initialize: detect gateway + enable forwarding
  // ─────────────────────────────────────────
  async initialize() {
    try {
      // Auto-detect gateway IP
      if (!this.gatewayIP) {
        this.gatewayIP = await this._detectGateway();
      }

      // Auto-detect interface if not set
      if (!this.interface) {
        this.interface = await this._detectInterface();
      }

      // Enable IP forwarding (required for ARP spoof to work without breaking network)
      await this._exec('sudo sysctl -w net.ipv4.ip_forward=1 2>/dev/null');

      this._initialized = true;
      console.log(`🔥 IPFirewall initialized (Gateway: ${this.gatewayIP}, Interface: ${this.interface})`);
      return true;
    } catch (error) {
      console.error('⚠️  IPFirewall init warning:', error.message);
      // Still mark as initialized — we can fall back to iptables-only
      this._initialized = true;
      return false;
    }
  }

  // ─────────────────────────────────────────
  // Detect default gateway IP
  // ─────────────────────────────────────────
  async _detectGateway() {
    try {
      const output = await this._exec("ip route show default | awk '/default/ {print $3}' | head -1");
      const gw = output.trim();
      if (gw && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(gw)) {
        return gw;
      }
    } catch {}

    // Fallback
    try {
      const output = await this._exec("route -n | awk '/^0.0.0.0/ {print $2}' | head -1");
      const gw = output.trim();
      if (gw && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(gw)) {
        return gw;
      }
    } catch {}

    throw new Error('Tidak dapat mendeteksi gateway IP');
  }

  // ─────────────────────────────────────────
  // Detect active network interface
  // ─────────────────────────────────────────
  async _detectInterface() {
    try {
      const output = await this._exec("ip route show default | awk '/default/ {print $5}' | head -1");
      return output.trim() || 'eth0';
    } catch {
      return 'eth0';
    }
  }

  // ─────────────────────────────────────────
  // Block device by IP (ARP Spoof + iptables combo)
  // ─────────────────────────────────────────
  async blockIP(ip, mac = null) {
    if (!this._initialized) await this.initialize();

    // Validate IP format
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return { success: false, error: 'Format IP tidak valid' };
    }

    // Don't block gateway
    if (ip === this.gatewayIP) {
      return { success: false, error: 'Tidak bisa memblokir gateway!' };
    }

    // Don't block own IP
    try {
      const localIP = await this._exec("hostname -I | awk '{print $1}'");
      if (ip === localIP.trim()) {
        return { success: false, error: 'Tidak bisa memblokir IP sendiri!' };
      }
    } catch {}

    // Check if already blocked
    const key = mac || ip;
    if (this._blockedProcesses.has(key)) {
      return { success: false, error: 'IP sudah diblokir sebelumnya' };
    }

    const methods = [];

    // Method 1: ARP Spoofing (most effective for non-gateway setup)
    try {
      const arpProcess = await this._startArpSpoof(ip);
      if (arpProcess) {
        this._blockedProcesses.set(key, { process: arpProcess, ip, mac, method: 'arpspoof' });
        methods.push('ARP Spoof');
      }
    } catch (err) {
      console.log(`⚠️  ARP spoof unavailable: ${err.message}`);
    }

    // Method 2: iptables (supplementary — blocks traffic if it reaches STB)
    try {
      await this._exec(`sudo iptables -C FORWARD -s ${ip} -j DROP 2>/dev/null || sudo iptables -A FORWARD -s ${ip} -j DROP`);
      await this._exec(`sudo iptables -C FORWARD -d ${ip} -j DROP 2>/dev/null || sudo iptables -A FORWARD -d ${ip} -j DROP`);
      methods.push('iptables');
    } catch {}

    // Method 3: ebtables / arptables (Layer 2 block)
    try {
      if (mac) {
        await this._exec(`sudo arptables -C INPUT -s ${mac} -j DROP 2>/dev/null || sudo arptables -A INPUT -s ${mac} -j DROP`);
        methods.push('arptables');
      }
    } catch {}

    // If no ARP spoof process but we have at least iptables
    if (!this._blockedProcesses.has(key) && methods.length > 0) {
      this._blockedProcesses.set(key, { process: null, ip, mac, method: methods.join('+') });
    }

    if (methods.length === 0) {
      return { success: false, error: 'Tidak ada metode blocking yang tersedia. Install `dsniff` (untuk arpspoof) atau pastikan iptables tersedia.' };
    }

    console.log(`🔥 BLOCKED: ${ip} (${mac || 'N/A'}) via ${methods.join(' + ')}`);
    return { success: true, methods, ip, mac };
  }

  // ─────────────────────────────────────────
  // Start ARP spoofing process
  // ─────────────────────────────────────────
  async _startArpSpoof(targetIP) {
    // Check if arpspoof is available
    try {
      await this._exec('which arpspoof');
    } catch {
      // Try nping as alternative
      try {
        await this._exec('which nping');
        return this._startNpingSpoof(targetIP);
      } catch {
        throw new Error('arpspoof dan nping tidak ditemukan');
      }
    }

    return new Promise((resolve, reject) => {
      try {
        // Tell the target device that WE are the gateway (redirect their traffic to us, then drop it)
        const proc = spawn('sudo', ['arpspoof', '-i', this.interface, '-t', targetIP, this.gatewayIP], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });

        proc.on('error', (err) => {
          reject(err);
        });

        // Give it a moment to start
        setTimeout(() => {
          if (proc.exitCode === null) {
            resolve(proc);
          } else {
            reject(new Error('arpspoof process exited immediately'));
          }
        }, 500);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─────────────────────────────────────────
  // Alternative: Use nping for ARP spoofing
  // ─────────────────────────────────────────
  async _startNpingSpoof(targetIP) {
    return new Promise((resolve, reject) => {
      try {
        // Send continuous fake ARP replies
        const proc = spawn('sudo', [
          'nping', '--arp', '--arp-type', 'ARP-reply',
          '--arp-sender-ip', this.gatewayIP,
          '--arp-sender-mac', 'DE:AD:BE:EF:CA:FE',
          '--arp-target-ip', targetIP,
          '-e', this.interface,
          '--delay', '1s',
          '-c', '0', // Infinite
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });

        proc.on('error', reject);

        setTimeout(() => {
          if (proc.exitCode === null) {
            resolve(proc);
          } else {
            reject(new Error('nping process exited immediately'));
          }
        }, 500);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─────────────────────────────────────────
  // Unblock device by IP
  // ─────────────────────────────────────────
  async unblockIP(ip, mac = null) {
    if (!this._initialized) await this.initialize();

    const key = mac || ip;

    // Stop ARP spoof process
    const entry = this._blockedProcesses.get(key);
    if (entry) {
      if (entry.process) {
        try {
          process.kill(-entry.process.pid, 'SIGTERM');
        } catch {
          try {
            entry.process.kill('SIGTERM');
          } catch {}
        }
        // Also kill any remaining arpspoof/nping for this IP
        try {
          await this._exec(`sudo pkill -f "arpspoof.*${ip}" 2>/dev/null`);
          await this._exec(`sudo pkill -f "nping.*${ip}" 2>/dev/null`);
        } catch {}
      }
      this._blockedProcesses.delete(key);
    } else {
      // Try to kill any orphaned arpspoof process for this IP
      try {
        await this._exec(`sudo pkill -f "arpspoof.*${ip}" 2>/dev/null`);
        await this._exec(`sudo pkill -f "nping.*${ip}" 2>/dev/null`);
      } catch {}
    }

    // Remove iptables rules
    try {
      await this._exec(`sudo iptables -D FORWARD -s ${ip} -j DROP 2>/dev/null`);
      await this._exec(`sudo iptables -D FORWARD -d ${ip} -j DROP 2>/dev/null`);
    } catch {}

    // Remove arptables rules
    if (mac) {
      try {
        await this._exec(`sudo arptables -D INPUT -s ${mac} -j DROP 2>/dev/null`);
      } catch {}
    }

    // Restore correct ARP for the target (send gratuitous ARP)
    try {
      const gwMAC = await this._getGatewayMAC();
      if (gwMAC) {
        await this._exec(`sudo arping -c 3 -A -I ${this.interface} ${this.gatewayIP} 2>/dev/null`);
      }
    } catch {}

    console.log(`🔓 UNBLOCKED: ${ip} (${mac || 'N/A'})`);
    return { success: true, ip, mac };
  }

  // ─────────────────────────────────────────
  // Get gateway MAC address
  // ─────────────────────────────────────────
  async _getGatewayMAC() {
    try {
      const output = await this._exec(`arp -n ${this.gatewayIP} | awk 'NR==2 {print $3}'`);
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────
  // List all currently blocked IPs
  // ─────────────────────────────────────────
  getBlockedList() {
    const blocked = [];
    for (const [key, entry] of this._blockedProcesses) {
      blocked.push({
        ip: entry.ip,
        mac: entry.mac || 'N/A',
        method: entry.method || 'unknown',
        active: entry.process ? (entry.process.exitCode === null) : true,
      });
    }
    return blocked;
  }

  // ─────────────────────────────────────────
  // Check if IP is currently blocked
  // ─────────────────────────────────────────
  isBlocked(ip, mac = null) {
    const key = mac || ip;
    return this._blockedProcesses.has(key);
  }

  // ─────────────────────────────────────────
  // Check available blocking tools
  // ─────────────────────────────────────────
  async checkTools() {
    const tools = { arpspoof: false, nping: false, iptables: false, arptables: false };

    try { await this._exec('which arpspoof'); tools.arpspoof = true; } catch {}
    try { await this._exec('which nping'); tools.nping = true; } catch {}
    try { await this._exec('which iptables'); tools.iptables = true; } catch {}
    try { await this._exec('which arptables'); tools.arptables = true; } catch {}

    return tools;
  }

  // ─────────────────────────────────────────
  // Cleanup: stop all blocking processes
  // ─────────────────────────────────────────
  async cleanup() {
    console.log('🔥 Cleaning up firewall rules...');
    for (const [key, entry] of this._blockedProcesses) {
      await this.unblockIP(entry.ip, entry.mac);
    }
    this._blockedProcesses.clear();

    // Kill any orphaned arpspoof/nping processes
    try { await this._exec('sudo pkill -f arpspoof 2>/dev/null'); } catch {}
    try { await this._exec('sudo pkill -f "nping.*arp" 2>/dev/null'); } catch {}
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

module.exports = IPFirewall;
