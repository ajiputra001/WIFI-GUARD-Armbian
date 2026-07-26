// ═══════════════════════════════════════════════════════════════
// 🌐 Dashboard Server — WiFi Guard Bot
// Express + Socket.IO real-time dashboard
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

class DashboardServer {
  constructor({ db, scanner, port = 3000 }) {
    this.db = db;
    this.scanner = scanner;
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server);
  }

  // ─────────────────────────────────────────
  // Initialize and start server
  // ─────────────────────────────────────────
  start() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    // API Routes
    this._setupRoutes();

    // Socket.IO
    this._setupSocket();

    // Start listening
    this.server.listen(this.port, () => {
      console.log(`🌐 Dashboard: http://localhost:${this.port}`);
    });
  }

  // ─────────────────────────────────────────
  // REST API Routes
  // ─────────────────────────────────────────
  _setupRoutes() {
    // Get all online devices
    this.app.get('/api/devices', (req, res) => {
      const devices = this.db.getOnlineDevices();
      res.json({ success: true, devices, count: devices.length });
    });

    // Get all devices (including offline)
    this.app.get('/api/devices/all', (req, res) => {
      const devices = this.db.getAllDevices();
      res.json({ success: true, devices, count: devices.length });
    });

    // Get stats
    this.app.get('/api/stats', (req, res) => {
      const stats = this.db.getStats();
      res.json({ success: true, stats });
    });

    // Get connection history
    this.app.get('/api/history', (req, res) => {
      const hours = parseInt(req.query.hours) || 24;
      const limit = parseInt(req.query.limit) || 50;
      const history = this.db.getHistory(hours, limit);
      res.json({ success: true, history, count: history.length });
    });

    // Get hourly stats
    this.app.get('/api/stats/hourly', (req, res) => {
      const hourly = this.db.getHourlyStats();
      res.json({ success: true, hourly });
    });

    // Set trust level
    this.app.post('/api/devices/:mac/trust', (req, res) => {
      const mac = decodeURIComponent(req.params.mac);
      const { level } = req.body;
      const success = this.db.setTrustLevel(mac, level);
      res.json({ success });
    });

    // Set device name
    this.app.post('/api/devices/:mac/name', (req, res) => {
      const mac = decodeURIComponent(req.params.mac);
      const { name } = req.body;
      this.db.setCustomName(mac, name);
      res.json({ success: true });
    });

    // System info
    this.app.get('/api/system', (req, res) => {
      const info = this.scanner.getSystemInfo();
      res.json({ success: true, info });
    });
  }

  // ─────────────────────────────────────────
  // Socket.IO for real-time updates
  // ─────────────────────────────────────────
  _setupSocket() {
    this.io.on('connection', (socket) => {
      // Send initial data
      socket.emit('init', {
        devices: this.db.getOnlineDevices(),
        stats: this.db.getStats(),
        system: this.scanner.getSystemInfo()
      });

      socket.on('disconnect', () => {
        // Client disconnected
      });
    });
  }

  // ─────────────────────────────────────────
  // Broadcast update to all connected clients
  // ─────────────────────────────────────────
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // ─────────────────────────────────────────
  // Handle device update events from alert engine
  // ─────────────────────────────────────────
  handleDeviceUpdate(eventType, data) {
    switch (eventType) {
      case 'new_device':
        this.broadcast('new_device', data);
        break;
      case 'disconnect':
        this.broadcast('device_disconnect', data);
        break;
      case 'reconnect':
        this.broadcast('device_reconnect', data);
        break;
      case 'scan_complete':
        this.broadcast('scan_update', data);
        break;
    }
  }
}

module.exports = DashboardServer;
