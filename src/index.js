// ═══════════════════════════════════════════════════════════════
// 🛡️ WiFi Guard Bot — Main Entry Point
// WhatsApp Network Intrusion Detection System
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const chalk = require('chalk');
const figlet = require('figlet');

// Modules
const NetworkScanner = require('./scanner/network-scanner');
const DeviceIdentifier = require('./scanner/device-identifier');
const DB = require('./database/db');
const WhatsAppClient = require('./whatsapp/wa-client');
const MessageFormatter = require('./whatsapp/message-formatter');
const CommandHandler = require('./whatsapp/command-handler');
const AlertEngine = require('./alert/alert-engine');
const DashboardServer = require('./dashboard/server');

// ─────────────────────────────────────────
// Configuration from .env
// ─────────────────────────────────────────
const config = {
  alertPhoneNumber: process.env.ALERT_PHONE_NUMBER || '',
  networkInterface: process.env.NETWORK_INTERFACE || null,
  networkSubnet: process.env.NETWORK_SUBNET || null,
  scanInterval: parseInt(process.env.SCAN_INTERVAL) || 30,
  alertsEnabled: process.env.ALERTS_ENABLED !== 'false',
  alertOnDisconnect: process.env.ALERT_ON_DISCONNECT === 'true',
  dailyReportEnabled: process.env.DAILY_REPORT_ENABLED !== 'false',
  dailyReportHour: parseInt(process.env.DAILY_REPORT_HOUR) || 8,
  dailyReportMinute: parseInt(process.env.DAILY_REPORT_MINUTE) || 0,
  dashboardPort: parseInt(process.env.DASHBOARD_PORT) || 3000,
  dashboardEnabled: process.env.DASHBOARD_ENABLED !== 'false',
  deepScanEnabled: process.env.DEEP_SCAN_ENABLED !== 'false',
  deepScanInterval: parseInt(process.env.DEEP_SCAN_INTERVAL) || 5,
  voiceAlertEnabled: process.env.VOICE_ALERT_ENABLED !== 'false',
  voiceAlertStyle: process.env.VOICE_ALERT_STYLE || 'anime',
  voiceAlertLang: process.env.VOICE_ALERT_LANG || 'id',
  voiceAlertPitch: parseInt(process.env.VOICE_ALERT_PITCH) || 92,
  voiceAlertSpeed: parseInt(process.env.VOICE_ALERT_SPEED) || 165,
  voiceAlertOnNewDevice: process.env.VOICE_ALERT_ON_NEW_DEVICE !== 'false',
  voiceAlertOnReconnect: process.env.VOICE_ALERT_ON_RECONNECT === 'true',
  voiceAlertOnDisconnect: process.env.VOICE_ALERT_ON_DISCONNECT === 'true',
};

// Helper to strip ANSI codes and calculate true terminal column display width (handles Emojis & ANSI)
function getDisplayWidth(str) {
  const clean = str.replace(/\u001b\[[0-9;]*m/g, '').replace(/\uFE0F/g, '');
  let width = 0;
  for (let i = 0; i < clean.length; i++) {
    const cp = clean.codePointAt(i);
    if (cp > 0xffff) {
      width += 2; // Emoji surrogate pair (2 display columns in terminal)
      i++;
    } else if ((cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2300 && cp <= 0x23ff) || (cp >= 0x2b50 && cp <= 0x2b55)) {
      width += 2; // Symbols / emojis taking 2 columns in terminal
    } else {
      width += 1;
    }
  }
  return width;
}

// ─────────────────────────────────────────
// Print Banner — AJIPUTRA-TECH
// ─────────────────────────────────────────
function printBanner() {
  const width = 64;
  const border = chalk.cyan;

  console.log('');
  console.log(border('  ╔' + '═'.repeat(width) + '╗'));

  // ASCII Art lines with Slant font
  const artLines = figlet.textSync('WiFi Guard', { font: 'Slant', horizontalLayout: 'default' }).split('\n');
  for (const line of artLines) {
    const vLen = getDisplayWidth(line);
    if (vLen > 0 && vLen <= width) {
      const leftPad = Math.floor((width - vLen) / 2);
      const rightPad = width - vLen - leftPad;
      console.log(border('  ║') + ' '.repeat(leftPad) + chalk.cyanBright.bold(line) + ' '.repeat(rightPad) + border('║'));
    }
  }

  // Divider
  console.log(border('  ╠' + '═'.repeat(width) + '╣'));

  // Subtitle
  const sub = chalk.white.bold('🛡  WhatsApp Network Alert Detection System');
  const subPadL = Math.floor((width - getDisplayWidth(sub)) / 2);
  const subPadR = width - getDisplayWidth(sub) - subPadL;
  console.log(border('  ║') + ' '.repeat(subPadL) + sub + ' '.repeat(subPadR) + border('║'));

  // Divider
  console.log(border('  ╠' + '═'.repeat(width) + '╣'));

  // Developer Badge
  const dev1 = chalk.hex('#FFD700').bold('⚡ Developed by ') + chalk.hex('#00E5FF').bold('AJIPUTRA-TECH') + chalk.hex('#FFD700').bold(' ⚡');
  const dev1PadL = Math.floor((width - getDisplayWidth(dev1)) / 2);
  const dev1PadR = width - getDisplayWidth(dev1) - dev1PadL;
  console.log(border('  ║') + ' '.repeat(dev1PadL) + dev1 + ' '.repeat(dev1PadR) + border('║'));

  const dev2 = chalk.hex('#90A4AE')('Cybersecurity Division');
  const dev2PadL = Math.floor((width - getDisplayWidth(dev2)) / 2);
  const dev2PadR = width - getDisplayWidth(dev2) - dev2PadL;
  console.log(border('  ║') + ' '.repeat(dev2PadL) + dev2 + ' '.repeat(dev2PadR) + border('║'));

  // Divider
  console.log(border('  ╠' + '═'.repeat(width) + '╣'));

  // Info line
  const info = chalk.gray('v1.0.0 | Node.js | Real-time Netlink + Human Voice Notification');
  const infoPadL = Math.floor((width - getDisplayWidth(info)) / 2);
  const infoPadR = width - getDisplayWidth(info) - infoPadL;
  console.log(border('  ║') + ' '.repeat(infoPadL) + info + ' '.repeat(infoPadR) + border('║'));

  console.log(border('  ╚' + '═'.repeat(width) + '╝'));
  console.log('');
}

// ─────────────────────────────────────────
// Main Application
// ─────────────────────────────────────────
async function main() {
  printBanner();

  // 1. Initialize Database
  console.log(chalk.yellow('📦 Initializing database...'));
  const db = new DB();
  db.initialize();
  console.log(chalk.green('✅ Database ready'));

  // 2. Initialize Network Scanner
  console.log(chalk.yellow('📡 Initializing network scanner...'));
  const scanner = new NetworkScanner({
    interface: config.networkInterface,
    subnet: config.networkSubnet,
    deepScanEnabled: config.deepScanEnabled,
  });

  // Check dependencies
  const deps = await scanner.checkDependencies();
  if (!deps.arpScan) {
    console.log(chalk.red('⚠️  arp-scan not found. Install: sudo apt install arp-scan'));
    console.log(chalk.yellow('   Bot will use ARP table fallback (less accurate)'));
  }
  if (!deps.nmap) {
    console.log(chalk.red('⚠️  nmap not found. Install: sudo apt install nmap'));
    console.log(chalk.yellow('   Deep scan (OS detection) will be disabled'));
  }

  // System info
  const systemInfo = scanner.getSystemInfo();
  console.log(chalk.green('✅ Network scanner ready'));
  console.log(chalk.gray(`   Interface: ${systemInfo.interface}`));
  console.log(chalk.gray(`   Local IP:  ${systemInfo.localIP}`));
  console.log(chalk.gray(`   Subnet:    ${systemInfo.subnet}`));

  // 3. Initialize Device Identifier
  const identifier = new DeviceIdentifier();
  console.log(chalk.green('✅ Device identifier ready'));

  // 4. Initialize Message Formatter
  const formatter = new MessageFormatter();

  // 5. Initialize WhatsApp Client
  console.log(chalk.yellow('📱 Initializing WhatsApp client...'));

  if (!config.alertPhoneNumber) {
    console.log(chalk.red('⚠️  ALERT_PHONE_NUMBER not set in .env'));
    console.log(chalk.yellow('   Bot will run but WhatsApp alerts will be disabled'));
    console.log(chalk.yellow('   Set it in .env file: ALERT_PHONE_NUMBER=6281234567890'));
  }

  const waClient = new WhatsAppClient({
    alertPhoneNumber: config.alertPhoneNumber,
  });

  // 6. Initialize Alert Engine
  const alertEngine = new AlertEngine({
    db, scanner, identifier, formatter, waClient,
    config: {
      scanInterval: config.scanInterval,
      deepScanInterval: config.deepScanInterval,
      alertsEnabled: config.alertsEnabled,
      alertOnDisconnect: config.alertOnDisconnect,
      dailyReportEnabled: config.dailyReportEnabled,
      dailyReportHour: config.dailyReportHour,
      dailyReportMinute: config.dailyReportMinute,
      voiceAlertEnabled: config.voiceAlertEnabled,
      voiceAlertStyle: config.voiceAlertStyle,
      voiceAlertLang: config.voiceAlertLang,
      voiceAlertPitch: config.voiceAlertPitch,
      voiceAlertSpeed: config.voiceAlertSpeed,
      voiceAlertOnNewDevice: config.voiceAlertOnNewDevice,
      voiceAlertOnReconnect: config.voiceAlertOnReconnect,
      voiceAlertOnDisconnect: config.voiceAlertOnDisconnect,
    },
  });

  // 7. Initialize Command Handler
  const commandHandler = new CommandHandler({
    db, scanner, identifier, formatter, alertEngine, waClient,
  });

  // Set message handler
  waClient.onMessage(async (msg) => {
    await commandHandler.handleMessage(msg);
  });

  // 8. Initialize Dashboard
  let dashboard = null;
  if (config.dashboardEnabled) {
    console.log(chalk.yellow('🌐 Initializing dashboard...'));
    dashboard = new DashboardServer({
      db, scanner,
      port: config.dashboardPort,
    });

    // Connect alert engine to dashboard for real-time updates
    alertEngine.onDeviceUpdate((event, data) => {
      dashboard.handleDeviceUpdate(event, data);
    });

    dashboard.start();
    console.log(chalk.green(`✅ Dashboard ready`));
  }

  // 9. Start WhatsApp Client
  try {
    await waClient.initialize();
    console.log(chalk.green('✅ WhatsApp client ready'));

    // Send startup message
    if (config.alertPhoneNumber) {
      const startupMsg = formatter.formatStartup(systemInfo);
      await waClient.sendAlert(startupMsg);
    }
  } catch (error) {
    console.log(chalk.red(`❌ WhatsApp init failed: ${error.message}`));
    console.log(chalk.yellow('   Bot will continue without WhatsApp (dashboard & scanner still active)'));
  }

  // 10. Start Alert Engine (begins scanning)
  console.log(chalk.yellow('⚡ Starting alert engine...'));
  alertEngine.start();

  // ─────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────
  console.log('');
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log(chalk.cyan.bold('  🛡️  WiFi Guard Bot is RUNNING'));
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log(chalk.gray(`  📡 Scanning every ${config.scanInterval}s`));
  console.log(chalk.gray(`  🔍 Deep scan every ${config.deepScanInterval}m`));
  if (config.alertPhoneNumber) {
    console.log(chalk.gray(`  📱 Alerts → ${config.alertPhoneNumber}`));
  }
  const styleLabel = config.voiceAlertStyle === 'stasiun'
    ? '🚆 Suara Pengumuman Stasiun (Manusia AI)'
    : config.voiceAlertStyle === 'anime'
      ? '🌸 Anime Girl Voice'
      : '🎙️ Suara Manusia AI';
  console.log(chalk.gray(`  🔊 Voice Alert → ${config.voiceAlertEnabled ? styleLabel : 'OFF'}`));
  if (config.dashboardEnabled) {
    console.log(chalk.gray(`  🌐 Dashboard → http://localhost:${config.dashboardPort}`));
  }
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log('');

  // ─────────────────────────────────────────
  // Graceful Shutdown
  // ─────────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(chalk.yellow(`\n🛑 ${signal} received. Shutting down...`));

    alertEngine.stop();

    if (config.alertPhoneNumber && waClient.isReady) {
      try {
        await waClient.sendAlert('🛑 *WiFi Guard Bot OFFLINE*\n\nBot telah dihentikan.');
      } catch { }
    }

    await waClient.destroy();
    db.close();

    console.log(chalk.green('✅ Cleanup complete. Goodbye! 👋'));
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('💥 Uncaught Exception:'), error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('💥 Unhandled Rejection:'), reason);
  });
}

// Run!
main().catch((error) => {
  console.error(chalk.red('💥 Fatal error:'), error);
  process.exit(1);
});
