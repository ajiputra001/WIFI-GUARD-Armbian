# 🛡️ WiFi Guard Bot — WhatsApp & AI Voice Network Intrusion Detection System

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Armbian-Ubuntu%20%7C%20Debian-3771A1?style=for-the-badge&logo=armbian&logoColor=white" alt="Armbian OS" />
  <img src="https://img.shields.io/badge/Speaker-AUX%203.5mm%20Audio-FF6F00?style=for-the-badge&logo=speaker" alt="AUX Audio Out" />
  <img src="https://img.shields.io/badge/Cybersecurity-IDS%20Engine-red?style=for-the-badge&logo=shield" alt="Cybersecurity" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

---

**WiFi Guard Bot** adalah sistem **Intrusion Detection System (IDS) Keamanan Jaringan Real-Time** berbasis **Node.js, WhatsApp Web, dan Human AI Voice Announcement**. System ini dirancang khusus dan teruji 100% mendukung **STB Armbian (Ubuntu / Debian)** seperti HG680P, B860H, TX3, X96, serta mendukung pemutaran suara pengumuman langsung ke **Lubang AUX (3.5mm Jack)** yang dicolok ke speaker eksternal.

---

## ✨ Fitur Utama

- 🔍 **Real-time Network Scanning** — Scan instan kernel netlink ARP & DNS resolution (<15ms)
- 🔊 **AUX 3.5mm Speaker Output** — Mengeluarkan notifikasi suara AI jernih langsung via lubang AUX pada STB Armbian
- 🚆 **Human AI Voice Announcement** — Suara pengumuman jernih manusia (Gaya Stasiun Kereta / Google Neural AI / Anime Girl)
- 🧠 **Smart Device Identification** — Identifikasi otomatis nama perangkat (`OPPO F11`, `Redmi A3`, `Galaxy A03s`, `Redmi Note 14`), vendor, & tipe
- 📱 **WhatsApp Alert** — Notifikasi instan via pesan perorangan atau ID Grup WhatsApp
- 🤖 **WhatsApp Command System** — Perintah bot langsung via chat WhatsApp (`!status`, `!devices`, `!block`, dll)
- 🌐 **Web Dashboard** — Monitoring real-time UI Cyber Security Dark Mode (`http://localhost:3000`)
- 🔒 **Threat Classification** — Trusted / Known / Unknown / Suspicious detection

---

## ⚡ Automated Install (Armbian Ubuntu & Debian STB)

Mendukung penuh OS **Armbian Ubuntu (20.04, 22.04, 24.04 Focal/Jammy/Noble)** dan **Armbian Debian (11 Bullseye, 12 Bookworm, 13 Trixie)** pada chipset Amlogic, Rockchip, Allwinner, & Raspberry Pi.

Cukup clone repository lalu jalankan script installer otomatis 1-klik:

```bash
# 1. Clone repository
git clone https://github.com/ajiputra001/WIFI-GUARD-Armbian.git
cd WIFI-GUARD-Armbian

# 2. Jalankan installer otomatis (Semua dependensi & Chromium ARM terinstall otomatis!)
sudo bash install.sh
```

> 💡 Script `install.sh` akan secara otomatis menginstall Node.js 20 LTS, Chromium ARM, tools audio (`mpg123`, `alsa-utils`, `espeak`, `ffmpeg`), serta meng-unmute volume AUX pada soundcard STB Armbian.

---

## 🔊 Pengujian Suara Speaker AUX (3.5mm Jack)

Setelah dicolokkan speaker ke lubang AUX pada STB Armbian, jalankan perintah berikut untuk menguji suara:

```bash
npm run test-audio
```

Atau jalankan script diagnosis langsung:

```bash
bash setup-aux-audio.sh
```

Jika suara terlalu kecil atau mute, Anda bisa membuka mixer ALSA kapan saja:
```bash
alsamixer
```

---

## 🚀 Cara Menjalankan Bot

### 1. Jalankan Langsung (Standard)
```bash
sudo node src/index.js
```

### 2. Jalankan di Latar Belakang & Auto-Start Saat STB Dinyalakan (PM2)
```bash
# Menjalankan di latar belakang
sudo npx pm2 start src/index.js --name "wifi-guard"

# Simpan agar otomatis berjalan setiap kali STB Booting/Dinyalakan
sudo npx pm2 save
sudo npx pm2 startup

# Melihat status & log
sudo npx pm2 status
sudo npx pm2 logs

# Stop bot
sudo npx pm2 stop wifi-guard
```

---

## ⚙️ Konfigurasi (.env)

Edit file `.env` untuk mengatur WhatsApp, Suara, dan Scanner:

```bash
nano .env
```

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `ALERT_PHONE_NUMBER` | — | Nomor WA / ID Grup penerima alert |
| `VOICE_ALERT_ENABLED` | `true` | Aktifkan suara speaker AUX |
| `VOICE_ALERT_STYLE` | `stasiun` | Gaya suara (`stasiun`, `human`, `anime`) |
| `VOICE_ALERT_LANG` | `id` | Bahasa suara (`id` = Bahasa Indonesia) |
| `SCAN_INTERVAL` | `3` | Interval fast scan dalam detik |
| `ALERT_ON_DISCONNECT` | `true` | Notifikasi saat perangkat terputus |
| `DASHBOARD_PORT` | `3000` | Port web dashboard |

---

## 📱 WhatsApp Commands

Kirim perintah berikut ke WhatsApp Bot:

| Command | Fungsi |
|---------|--------|
| `!status` | Status bot & ringkasan jaringan |
| `!devices` | Daftar semua perangkat online |
| `!scan` | Force scan jaringan sekarang |
| `!trust <MAC>` | Tandai perangkat sebagai trusted |
| `!untrust <MAC>` | Hapus status trusted |
| `!block <MAC>` | Block perangkat |
| `!name <MAC> <nama>` | Beri nama custom ke perangkat |
| `!history` | Riwayat 24 jam terakhir |
| `!stats` | Statistik lengkap |
| `!help` | Tampilkan daftar perintah |

---

## 📜 License

MIT License — Free to use and modify.

**Made with ❤️ by AJIPUTRA-TECH Cybersecurity Division**
