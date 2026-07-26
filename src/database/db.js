// ═══════════════════════════════════════════════════════════════
// 💾 Database Manager — WiFi Guard Bot
// SQLite database for device tracking and connection logs
// ═══════════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const path = require('path');

class DB {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(process.cwd(), 'wifi_guard.db');
    this.db = null;
  }

  // ─────────────────────────────────────────
  // Initialize database and create tables
  // ─────────────────────────────────────────
  initialize() {
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');

    this._createTables();
    return this;
  }

  _createTables() {
    this.db.exec(`
      -- Semua perangkat yang pernah terdeteksi
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac TEXT UNIQUE NOT NULL,
        ip TEXT,
        vendor TEXT DEFAULT 'Unknown',
        nmap_vendor TEXT,
        hostname TEXT,
        os TEXT,
        device_type TEXT DEFAULT 'unknown',
        device_icon TEXT DEFAULT '❓',
        device_label TEXT DEFAULT 'Tidak Diketahui',
        trust_level TEXT DEFAULT 'unknown',
        custom_name TEXT,
        is_online INTEGER DEFAULT 0,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_connections INTEGER DEFAULT 0,
        notes TEXT
      );

      -- Log koneksi dan disconnect
      CREATE TABLE IF NOT EXISTS connection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL,
        mac TEXT NOT NULL,
        event_type TEXT NOT NULL,
        ip TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id)
      );

      -- Log setiap scan
      CREATE TABLE IF NOT EXISTS scan_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_devices INTEGER DEFAULT 0,
        new_devices INTEGER DEFAULT 0,
        disconnected_devices INTEGER DEFAULT 0,
        scan_duration_ms INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index untuk performa
      CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac);
      CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(is_online);
      CREATE INDEX IF NOT EXISTS idx_devices_trust ON devices(trust_level);
      CREATE INDEX IF NOT EXISTS idx_conn_logs_time ON connection_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_conn_logs_mac ON connection_logs(mac);
    `);
  }

  // ═══════════════════════════════════════════
  // Device Operations
  // ═══════════════════════════════════════════

  // Add or update a device
  addOrUpdateDevice(device) {
    const existing = this.getDeviceByMAC(device.mac);

    if (existing) {
      // Update existing device
      const stmt = this.db.prepare(`
        UPDATE devices SET
          ip = ?,
          vendor = COALESCE(?, vendor),
          nmap_vendor = COALESCE(?, nmap_vendor),
          hostname = COALESCE(?, hostname),
          os = COALESCE(?, os),
          device_type = COALESCE(?, device_type),
          device_icon = COALESCE(?, device_icon),
          device_label = COALESCE(?, device_label),
          is_online = 1,
          last_seen = CURRENT_TIMESTAMP
        WHERE mac = ?
      `);
      stmt.run(
        device.ip,
        device.vendor, device.nmapVendor, device.hostname, device.os,
        device.type, device.icon, device.label,
        device.mac
      );
      return {
        ...existing,
        ...device,
        hostname: device.hostname || existing.hostname || null,
        custom_name: existing.custom_name || device.custom_name || null,
        isNew: false
      };
    } else {
      // Insert new device
      const stmt = this.db.prepare(`
        INSERT INTO devices (mac, ip, vendor, nmap_vendor, hostname, os, device_type, device_icon, device_label, is_online, total_connections)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `);
      const result = stmt.run(
        device.mac, device.ip,
        device.vendor || 'Unknown', device.nmapVendor || null,
        device.hostname || null, device.os || null,
        device.type || 'unknown', device.icon || '❓', device.label || 'Tidak Diketahui'
      );
      return { ...device, id: result.lastInsertRowid, isNew: true };
    }
  }

  // Get device by MAC address
  getDeviceByMAC(mac) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE mac = ?');
    return stmt.get(mac);
  }

  // Get all devices
  getAllDevices() {
    return this.db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
  }

  // Get online devices
  getOnlineDevices() {
    return this.db.prepare('SELECT * FROM devices WHERE is_online = 1 ORDER BY last_seen DESC').all();
  }

  // Get devices by trust level
  getDevicesByTrust(trustLevel) {
    return this.db.prepare('SELECT * FROM devices WHERE trust_level = ? ORDER BY last_seen DESC').all(trustLevel);
  }

  // Set device offline
  setDeviceOffline(mac) {
    const stmt = this.db.prepare(`
      UPDATE devices SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE mac = ?
    `);
    return stmt.run(mac);
  }

  // Set all devices offline (for fresh scan comparison)
  setAllDevicesOffline() {
    this.db.prepare('UPDATE devices SET is_online = 0').run();
  }

  // Set trust level
  setTrustLevel(mac, level) {
    const stmt = this.db.prepare('UPDATE devices SET trust_level = ? WHERE mac = ?');
    const result = stmt.run(level, mac);
    return result.changes > 0;
  }

  // Set custom name
  setCustomName(mac, name) {
    const stmt = this.db.prepare('UPDATE devices SET custom_name = ? WHERE mac = ?');
    return stmt.run(name, mac);
  }

  // Increment connection count
  incrementConnections(mac) {
    this.db.prepare('UPDATE devices SET total_connections = total_connections + 1 WHERE mac = ?').run(mac);
  }

  // ═══════════════════════════════════════════
  // Connection Log Operations
  // ═══════════════════════════════════════════

  logConnection(deviceId, mac, eventType, ip) {
    const stmt = this.db.prepare(`
      INSERT INTO connection_logs (device_id, mac, event_type, ip)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(deviceId, mac, eventType, ip);
  }

  // Get recent connection history
  getHistory(hours = 24, limit = 50) {
    return this.db.prepare(`
      SELECT cl.*, d.vendor, d.hostname, d.device_type, d.device_icon, d.custom_name, d.trust_level
      FROM connection_logs cl
      JOIN devices d ON d.id = cl.device_id
      WHERE cl.timestamp >= datetime('now', ?)
      ORDER BY cl.timestamp DESC
      LIMIT ?
    `).all(`-${hours} hours`, limit);
  }

  // Get connection count for a device in last N hours
  getRecentConnectionCount(mac, hours = 1) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM connection_logs
      WHERE mac = ? AND event_type = 'connect' AND timestamp >= datetime('now', ?)
    `).get(mac, `-${hours} hours`);
    return result ? result.count : 0;
  }

  // ═══════════════════════════════════════════
  // Scan Log Operations
  // ═══════════════════════════════════════════

  logScan(totalDevices, newDevices, disconnectedDevices, scanDuration) {
    const stmt = this.db.prepare(`
      INSERT INTO scan_logs (total_devices, new_devices, disconnected_devices, scan_duration_ms)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(totalDevices, newDevices, disconnectedDevices, scanDuration);
  }

  // ═══════════════════════════════════════════
  // Statistics
  // ═══════════════════════════════════════════

  getStats() {
    const totalDevices = this.db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
    const onlineDevices = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE is_online = 1').get().count;
    const trustedDevices = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE trust_level = ?').get('trusted').count;
    const unknownDevices = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE trust_level = ?').get('unknown').count;
    const blockedDevices = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE trust_level = ?').get('blocked').count;
    
    const todayConnections = this.db.prepare(`
      SELECT COUNT(*) as count FROM connection_logs
      WHERE event_type = 'connect' AND timestamp >= datetime('now', 'start of day')
    `).get().count;

    const todayNewDevices = this.db.prepare(`
      SELECT COUNT(*) as count FROM devices
      WHERE first_seen >= datetime('now', 'start of day')
    `).get().count;

    // Peak hour (most connections)
    const peakHour = this.db.prepare(`
      SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
      FROM connection_logs
      WHERE event_type = 'connect' AND timestamp >= datetime('now', '-7 days')
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `).get();

    // Most frequent device
    const topDevice = this.db.prepare(`
      SELECT d.*, COUNT(cl.id) as conn_count
      FROM devices d
      JOIN connection_logs cl ON cl.device_id = d.id
      WHERE cl.event_type = 'connect' AND cl.timestamp >= datetime('now', '-7 days')
      GROUP BY d.id
      ORDER BY conn_count DESC
      LIMIT 1
    `).get();

    return {
      totalDevices,
      onlineDevices,
      trustedDevices,
      unknownDevices,
      blockedDevices,
      todayConnections,
      todayNewDevices,
      peakHour: peakHour ? `${peakHour.hour}:00` : 'N/A',
      topDevice: topDevice ? (topDevice.custom_name || topDevice.hostname || topDevice.vendor) : 'N/A',
    };
  }

  // Hourly connection stats for the last 24 hours
  getHourlyStats() {
    return this.db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00', timestamp) as hour,
        SUM(CASE WHEN event_type = 'connect' THEN 1 ELSE 0 END) as connects,
        SUM(CASE WHEN event_type = 'disconnect' THEN 1 ELSE 0 END) as disconnects
      FROM connection_logs
      WHERE timestamp >= datetime('now', '-24 hours')
      GROUP BY hour
      ORDER BY hour ASC
    `).all();
  }

  // ═══════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════

  // Delete old logs (keep last N days)
  cleanupLogs(days = 30) {
    this.db.prepare(`DELETE FROM connection_logs WHERE timestamp < datetime('now', ?)`).run(`-${days} days`);
    this.db.prepare(`DELETE FROM scan_logs WHERE timestamp < datetime('now', ?)`).run(`-${days} days`);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DB;
