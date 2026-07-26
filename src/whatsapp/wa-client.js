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
    this._maxRetries = 3;
    this.pendingAlerts = [];
  }

  // ─────────────────────────────────────────
  // Find Chrome/Chromium executable
  // ─────────────────────────────────────────
  _findChromePath() {
    // 1. Check puppeteer cache for all users (handles sudo case)
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
              console.log(`🔍 Found Chrome: ${chromePath}`);
              return chromePath;
            }
          }
        } catch {}
      }
    }

    // 2. System-installed browsers (Prioritize Chromium ARM binaries for Armbian STB)
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

    return null; // Let puppeteer try default
  }

  // ─────────────────────────────────────────
  // Initialize WhatsApp client
  // ─────────────────────────────────────────
  async initialize() {
    return new Promise((resolve, reject) => {
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
          '--single-process',
          '--disable-software-rasterizer',
        ]
      };

      if (chromePath) {
        puppeteerConfig.executablePath = chromePath;
      }

      this.client = new Client({
        authStrategy: new LocalAuth(),
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
        this._retryCount = 0;
        console.log('✅ WhatsApp client connected & ready!');
        
        if (this.alertPhoneNumber) {
          console.log(`📱 Alert target: ${this.alertPhoneNumber}`);
        }
        
        // Process any queued alerts
        this._processPendingAlerts();

        resolve();
      });

      // Authenticated event
      this.client.on('authenticated', () => {
        console.log('🔐 WhatsApp authenticated successfully');
      });

      // Auth failure
      this.client.on('auth_failure', (msg) => {
        console.error('❌ WhatsApp auth failed:', msg);
        reject(new Error('WhatsApp authentication failed'));
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
            console.error('❌ Error handling message:', error);
          }
        }
      });

      // Initialize
      this.client.initialize().catch(reject);
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

    if (!this.isReady) {
      console.log('⚠️  WhatsApp not ready, alert queued in memory...');
      this.pendingAlerts.push(message);
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
      while (this.pendingAlerts.length > 0) {
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
    if (!this.isReady) {
      console.log('⚠️  WhatsApp not ready');
      return false;
    }

    try {
      await this.client.sendMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('❌ Failed to send message:', error.message);
      return this._sendWithRetry(chatId, message);
    }
  }

  // ─────────────────────────────────────────
  // Send with retry logic
  // ─────────────────────────────────────────
  async _sendWithRetry(chatId, message, retries = 3) {
    for (let i = 0; i < retries; i++) {
      await this._delay(2000 * (i + 1)); // Exponential backoff
      try {
        await this.client.sendMessage(chatId, message);
        return true;
      } catch (error) {
        console.log(`⚠️  Retry ${i + 1}/${retries} failed`);
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
    if (this._retryCount >= this._maxRetries) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this._retryCount++;
    const delay = 5000 * this._retryCount;
    console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this._retryCount}/${this._maxRetries})...`);
    
    await this._delay(delay);
    
    try {
      await this.client.initialize();
    } catch (error) {
      console.error('❌ Reconnection failed:', error.message);
    }
  }

  // ─────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async destroy() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {}
    }
  }
}

module.exports = WhatsAppClient;
