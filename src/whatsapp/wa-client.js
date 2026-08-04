// ═══════════════════════════════════════════════════════════════
// 📱 WhatsApp Client — WiFi Guard Bot
// Client wrapper untuk whatsapp-web.js
// ═══════════════════════════════════════════════════════════════

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');

class WhatsAppClient {
  constructor(config = {}) {
    this.alertPhoneNumber = config.alertPhoneNumber || null;
    this.client = null;
    this.isReady = false;
    this.onMessageCallback = null;
    this._retryCount = 0;
    this._maxRetries = 5;
    this.pendingAlerts = [];
    this._isReconnecting = false;
  }

  // ─────────────────────────────────────────
  // Find Chrome/Chromium executable
  // ─────────────────────────────────────────
  _findChromePath() {
    // 0. Environment variable override
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      console.log(`🔍 Found Chrome from ENV: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // 1. System-installed browsers (Prioritize native Chromium binaries for Armbian STB / Linux ARM)
    const systemPaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/snap/bin/chromium',
    ];

    for (const p of systemPaths) {
      if (fs.existsSync(p)) {
        console.log(`🔍 Found system Chrome: ${p}`);
        return p;
      }
    }

    // 2. Check puppeteer cache for all users (handles sudo case, fallback)
    const possibleUsers = [
      os.homedir(),
      path.join('/home', process.env.SUDO_USER || ''),
      '/root',
    ];

    for (const home of possibleUsers) {
      const cacheDir = path.join(home, '.cache', 'puppeteer', 'chrome');
      if (fs.existsSync(cacheDir)) {
        try {
          const versions = fs.readdirSync(cacheDir)
            .filter(d => d.startsWith('linux-'))
            .sort()
            .reverse(); // Latest first
          for (const ver of versions) {
            const chromePath = path.join(cacheDir, ver, 'chrome-linux64', 'chrome');
            if (fs.existsSync(chromePath)) {
              console.log(`🔍 Found cached Chrome: ${chromePath}`);
              return chromePath;
            }
          }
        } catch {}
      }
    }

    return null; // Let puppeteer try default
  }

  // ─────────────────────────────────────────
  // Clean up stale chromium locks & orphaned processes
  // ─────────────────────────────────────────
  _cleanupStaleLocks() {
    try {
      const authDir = path.join(process.cwd(), '.wwebjs_auth');
      if (fs.existsSync(authDir)) {
        // Recursive search for SingletonLock files
        const findAndRemoveLocks = (dir) => {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                findAndRemoveLocks(fullPath);
              } else if (file.includes('SingletonLock') || file.includes('SingletonCookie') || file.includes('SingletonSocket')) {
                fs.unlinkSync(fullPath);
                console.log(`🧹 Removed stale lock file: ${file}`);
              }
            } catch {}
          }
        };
        findAndRemoveLocks(authDir);
      }
    } catch (err) {
      console.log('⚠️  Lock cleanup warning:', err.message);
    }
  }

  // ─────────────────────────────────────────
  // Create new Client instance with event listeners
  // ─────────────────────────────────────────
  _createNewClient() {
    this._cleanupStaleLocks();
    const chromePath = this._findChromePath();

    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--no-zygote',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--single-process',
        '--disable-breakpad',
        '--disable-component-update',
        '--no-default-browser-check',
        '--js-flags=--max-old-space-size=512',
      ]
    };

    if (chromePath) {
      puppeteerConfig.executablePath = chromePath;
    }

    this.client = new Client({
      authStrategy: new LocalAuth(),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620-alpha.html',
      },
      puppeteer: puppeteerConfig,
    });

    // QR Code event
    this.client.on('qr', (qr) => {
      console.log('\n');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   📱 SCAN QR CODE DENGAN WHATSAPP       ║');
      console.log('║                                          ║');
      console.log('║   1. Buka WhatsApp di HP                 ║');
      console.log('║   2. Tap ⋮ > Linked Devices              ║');
      console.log('║   3. Tap "Link a Device"                 ║');
      console.log('║   4. Scan QR code di bawah ini           ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
    });

    // Ready event
    this.client.on('ready', () => {
      this.isReady = true;
      this._isReconnecting = false;
      this._retryCount = 0;
      console.log('✅ WhatsApp client connected & ready!');

      if (this.alertPhoneNumber) {
        console.log(`📱 Alert target: ${this.alertPhoneNumber}`);
      }

      // Process any queued alerts
      this._processPendingAlerts();
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authenticated successfully');
    });

    // Auth failure
    this.client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp auth failed:', msg);
      this.isReady = false;
      this._isReconnecting = false;
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      console.log('📵 WhatsApp disconnected:', reason);
      this.isReady = false;
      this._handleReconnect();
    });

    // Message handler: use message_create so self-messages & outgoing messages work
    this.client.on('message_create', async (msg) => {
      if (this.onMessageCallback) {
        try {
          await this.onMessageCallback(msg);
        } catch (error) {
          console.error('❌ Error handling message:', error.message);
        }
      }
    });
  }

  // ─────────────────────────────────────────
  // Initialize WhatsApp client
  // ─────────────────────────────────────────
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        this._createNewClient();

        const onReady = () => {
          cleanup();
          resolve();
        };

        const onAuthFail = (err) => {
          cleanup();
          reject(err || new Error('WhatsApp authentication failed'));
        };

        const cleanup = () => {
          if (this.client) {
            this.client.removeListener('ready', onReady);
            this.client.removeListener('auth_failure', onAuthFail);
          }
        };

        this.client.once('ready', onReady);
        this.client.once('auth_failure', onAuthFail);

        this.client.initialize().catch((err) => {
          cleanup();
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─────────────────────────────────────────
  // Set message handler
  // ─────────────────────────────────────────
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  // ─────────────────────────────────────────
  // Send message to alert phone number
  // ─────────────────────────────────────────
  async sendAlert(message) {
    if (!this.alertPhoneNumber) {
      console.log('⚠️  No alert target configured');
      return false;
    }

    if (!this.isReady || !this.client) {
      console.log('⚠️  WhatsApp not ready, alert queued in memory...');
      if (!this.pendingAlerts.includes(message)) {
        this.pendingAlerts.push(message);
      }
      return false;
    }

    let chatId = this.alertPhoneNumber.trim();
    if (!chatId.endsWith('@g.us') && !chatId.endsWith('@c.us')) {
      const cleanNum = chatId.replace(/\D/g, '');
      chatId = `${cleanNum}@c.us`;
    }

    return this.sendMessage(chatId, message);
  }

  // ─────────────────────────────────────────
  // Process pending alerts once ready
  // ─────────────────────────────────────────
  async _processPendingAlerts() {
    if (this.pendingAlerts.length > 0) {
      console.log(`📤 Sending ${this.pendingAlerts.length} queued alert(s)...`);
      while (this.pendingAlerts.length > 0 && this.isReady) {
        const msg = this.pendingAlerts.shift();
        await this.sendAlert(msg);
        await this._delay(1500);
      }
    }
  }

  // ─────────────────────────────────────────
  // Send message to specific chat
  // ─────────────────────────────────────────
  async sendMessage(chatId, message) {
    if (!this.isReady || !this.client) {
      console.log('⚠️  WhatsApp not ready, queuing message...');
      if (!this.pendingAlerts.includes(message)) {
        this.pendingAlerts.push(message);
      }
      return false;
    }

    try {
      await this.client.sendMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('❌ Failed to send message:', error.message);

      // Auto-recover from detached frame / execution context destroyed (Puppeteer crash)
      if (
        error.message.includes('detached Frame') ||
        error.message.includes('Execution context was destroyed') ||
        error.message.includes('Target closed') ||
        error.message.includes('Protocol error') ||
        error.message.includes('Session closed')
      ) {
        console.log('🔄 Puppeteer page context detached or closed. Initiating client reconnect...');
        this.isReady = false;
        if (!this.pendingAlerts.includes(message)) {
          this.pendingAlerts.push(message);
        }
        this._handleReconnect();
        return false;
      }

      return this._sendWithRetry(chatId, message);
    }
  }

  // ─────────────────────────────────────────
  // Send with retry logic
  // ─────────────────────────────────────────
  async _sendWithRetry(chatId, message, retries = 3) {
    for (let i = 0; i < retries; i++) {
      if (!this.isReady || !this.client) {
        if (!this.pendingAlerts.includes(message)) {
          this.pendingAlerts.push(message);
        }
        return false;
      }

      await this._delay(2000 * (i + 1));
      try {
        await this.client.sendMessage(chatId, message);
        return true;
      } catch (error) {
        console.log(`⚠️  Retry ${i + 1}/${retries} failed: ${error.message}`);
        if (
          error.message.includes('detached Frame') ||
          error.message.includes('Execution context was destroyed') ||
          error.message.includes('Target closed') ||
          error.message.includes('Protocol error')
        ) {
          this.isReady = false;
          if (!this.pendingAlerts.includes(message)) {
            this.pendingAlerts.push(message);
          }
          this._handleReconnect();
          return false;
        }
      }
    }
    console.error('❌ All retries exhausted for message send');
    return false;
  }

  // ─────────────────────────────────────────
  // Reply to a message
  // ─────────────────────────────────────────
  async reply(msg, text) {
    try {
      await msg.reply(text);
      return true;
    } catch (error) {
      console.log('⚠️  msg.reply failed, attempting direct send to chat...');
      const targetChat = msg.fromMe ? (msg.to || msg.from) : msg.from;
      if (targetChat) {
        return await this.sendMessage(targetChat, text);
      }
      return false;
    }
  }

  // ─────────────────────────────────────────
  // Handle reconnection
  // ─────────────────────────────────────────
  async _handleReconnect() {
    if (this._isReconnecting) return;
    this._isReconnecting = true;
    this.isReady = false;

    if (this._retryCount >= this._maxRetries) {
      console.error('❌ Max reconnection attempts reached. Pausing reconnect for 30s...');
      await this._delay(30000);
      this._retryCount = 0;
    }

    this._retryCount++;
    const delay = 5000 * this._retryCount;
    console.log(`🔄 Reconnecting WhatsApp in ${delay / 1000}s (attempt ${this._retryCount}/${this._maxRetries})...`);

    await this._delay(delay);

    try {
      if (this.client) {
        try {
          this.client.removeAllListeners();
          await this.client.destroy();
        } catch (err) {
          console.log('⚠️  Warning destroying old WA client:', err.message);
        }
        this.client = null;
      }

      this._createNewClient();
      await this.client.initialize();
    } catch (error) {
      console.error('❌ WhatsApp Reconnection failed:', error.message);
      this._isReconnecting = false;
      setTimeout(() => this._handleReconnect(), 10000);
    }
  }

  // ─────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async destroy() {
    this.isReady = false;
    this._isReconnecting = false;
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
      } catch {}
      this.client = null;
    }
  }
}

module.exports = WhatsAppClient;

