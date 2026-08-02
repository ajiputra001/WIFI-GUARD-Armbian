#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 🛡️ WiFi Guard Bot — One-Click Automated Installer
# Supports: Debian 11 (Bullseye), 12 (Bookworm), 13 (Trixie)
#           Ubuntu 20.04 (Focal), 22.04 (Jammy), 24.04 (Noble)
# ═══════════════════════════════════════════════════════════════

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${CYAN}"
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║                                                          ║"
    echo "  ║   🛡️  WiFi Guard Bot — Automated Installer              ║"
    echo "  ║       Cybersecurity Intrusion Detection System           ║"
    echo "  ║                                                          ║"
    echo "  ║   ⚡ Developed by AJIPUTRA-TECH                         ║"
    echo "  ║                                                          ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_banner

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ installer ini membutuhkan akses root.${NC}"
    echo -e "${YELLOW}Jalankan ulang dengan:${NC} sudo bash install.sh"
    exit 1
fi

echo -e "${GREEN}[1/5] 🔍 Checking System & Armbian Compatibility...${NC}"

# Detect OS & Architecture
ARCH=$(uname -m)
IS_ARMBIAN=0

if [ -f /etc/armbian-release ]; then
    IS_ARMBIAN=1
    . /etc/armbian-release
    echo -e "   📍 Detected Device: ${CYAN}Armbian STB (${BOARD_NAME:-ARM STB}) [${ARCH}]${NC}"
fi

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VER=$VERSION_ID
else
    echo -e "${RED}❌ /etc/os-release tidak ditemukan. Hanya mendukung Linux Debian/Ubuntu/Armbian.${NC}"
    exit 1
fi

echo -e "   📍 Detected OS: ${CYAN}${OS_NAME} ${OS_VER} (${ARCH})${NC}"

# 2. Update Package Lists
echo -e "\n${GREEN}[2/5] 📦 Updating System Packages...${NC}"
apt-get update -y

# 3. Install System & Audio Dependencies (Chromium ARM, ALSA, mpg123)
echo -e "\n${GREEN}[3/5] 🛠️ Installing Network, Chromium ARM & Audio AUX Dependencies...${NC}"
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    git \
    wget \
    gnupg \
    build-essential \
    arp-scan \
    nmap \
    mpg123 \
    espeak \
    speech-dispatcher \
    alsa-utils \
    pulseaudio-utils \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    chromium-browser \
    chromium \
    ffmpeg \
    mpv \
    sox \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 || true

# Unmute ALSA Volume Channels for AUX 3.5mm Speaker Output
echo -e "\n${GREEN}🔊 Un-muting ALSA AUX Output Volume...${NC}"
CONTROLS=(
    "Master" "Headphone" "Line Out" "Line" "Audio" "DAC" "PCM" "Speaker" "Output"
    "ACODEC" "ACODEC Left" "ACODEC Mute" "ACODEC Play" "ACODEC Ramp" "ACODEC Righ" "ACODEC Unmu" "ACODEC Volu"
    "AIU ACODEC" "AIU HDMI CT" "AIU SPDIF S"
)
for ctrl in "${CONTROLS[@]}"; do
    amixer set "$ctrl" 100% unmute 2>/dev/null || amixer set "$ctrl" 100%+ 2>/dev/null || amixer set "$ctrl" unmute 2>/dev/null || amixer sset "$ctrl" 100% unmute 2>/dev/null || true
done
amixer sset 'ACODEC' 100% unmute 2>/dev/null || true
amixer sset 'ACODEC Mute' unmute 2>/dev/null || amixer set 'ACODEC Mute' off 2>/dev/null || true
amixer sset 'ACODEC Unmu' unmute 2>/dev/null || amixer set 'ACODEC Unmu' on 2>/dev/null || true
amixer sset 'ACODEC Volu' 100% unmute 2>/dev/null || amixer set 'ACODEC Volu' 100% 2>/dev/null || true
amixer sset 'AIU ACODEC' 100% unmute 2>/dev/null || amixer set 'AIU ACODEC' 100% 2>/dev/null || true
if command -v alsactl >/dev/null 2>&1; then
    alsactl store 2>/dev/null || true
fi

# 4. Check & Install Node.js (Version >= 18)
echo -e "\n${GREEN}[4/5] 🟢 Checking Node.js Environment...${NC}"

NODE_REQUIRED=18
NODE_INSTALLED=0

if command -v node >/dev/null 2>&1; then
    NODE_CUR_VER=$(node -v | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_CUR_VER" -ge "$NODE_REQUIRED" ]; then
        NODE_INSTALLED=1
        echo -e "   ✅ Node.js $(node -v) is already installed."
    fi
fi

if [ "$NODE_INSTALLED" -eq 0 ]; then
    echo -e "${YELLOW}   ⚡ Node.js >= 18 belum terinstall. Mengunduh Node.js 20 LTS (NodeSource)...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "   ✅ Node.js $(node -v) successfully installed."
fi

# 5. Install Project NPM Dependencies
echo -e "\n${GREEN}[5/5] 📚 Installing Project Dependencies (NPM)...${NC}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

npm install

# Setup .env if missing
if [ ! -f .env ]; then
    echo -e "${YELLOW}   ⚙️ Creating .env configuration from template...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        cat << 'EOF' > .env
ALERT_PHONE_NUMBER=120363406334144686@g.us
SCAN_INTERVAL=3
ALERTS_ENABLED=true
ALERT_ON_DISCONNECT=true
DEEP_SCAN_ENABLED=true
DEEP_SCAN_INTERVAL=5
DAILY_REPORT_ENABLED=true
DAILY_REPORT_HOUR=8
DAILY_REPORT_MINUTE=0
DASHBOARD_PORT=3000
DASHBOARD_ENABLED=true
VOICE_ALERT_ENABLED=true
VOICE_ALERT_STYLE=stasiun
VOICE_ALERT_LANG=id
EOF
    fi
fi

echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅ INSTALASI WIFIGUARD BOT UNTUK ARMBIAN STB SELESAI! ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "  📢 ${BOLD}Uji Suara Speaker AUX:${NC}"
echo -e "     ${YELLOW}npm run test-audio${NC}"
echo -e ""
echo -e "  📌 ${BOLD}Cara Menjalankan Bot:${NC}"
echo -e "     ${YELLOW}sudo node src/index.js${NC}"
echo -e ""
echo -e "  📌 ${BOLD}Atau Menjalankan di Background (PM2):${NC}"
echo -e "     ${YELLOW}sudo npx pm2 start src/index.js --name \"wifi-guard\"${NC}"
echo -e "     ${YELLOW}sudo npx pm2 save && sudo npx pm2 startup${NC}"
echo -e ""
echo -e "  🌐 ${BOLD}Dashboard Web:${NC} http://localhost:3000"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

