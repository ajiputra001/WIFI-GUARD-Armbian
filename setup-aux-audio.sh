#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 🔊 WiFi Guard Bot — AUX Audio Sound Setup & Test (Armbian STB)
# Supports: Armbian Ubuntu, Armbian Debian, HG680P, B860H, S905X/W/L
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🔊 Armbian STB AUX 3.5mm Speaker Audio Setup & Test    ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root if needed for ALSA settings
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Menjalankan tanpa sudo. Beberapa pengaturan volume ALSA mungkin memerlukan root.${NC}"
fi

echo -e "${GREEN}[1/3] 🔍 Memeriksa Kartu Suara (ALSA Audio Devices)...${NC}"

if command -v aplay >/dev/null 2>&1; then
    echo -e "${BLUE}📌 Sound cards terdeteksi:${NC}"
    aplay -l 2>/dev/null || echo -e "${YELLOW}Tidak ada soundcard terdeteksi secara spesifik oleh aplay.${NC}"
else
    echo -e "${YELLOW}⚠️  aplay (alsa-utils) belum terinstall. Menginstall alsa-utils...${NC}"
    if [ "$EUID" -eq 0 ]; then
        apt-get update -qq && apt-get install -y -qq alsa-utils mpg123 espeak
    fi
fi

echo -e "\n${GREEN}[2/3] 🔓 Un-muting ALSA Volume Channels untuk Lubang AUX...${NC}"

# Loop over common ALSA controls on Armbian STBs (Amlogic, Allwinner, Rockchip)
CONTROLS=("Master" "Headphone" "Line Out" "Line" "Audio" "DAC" "PCM" "Speaker" "Output" "Playback")

for ctrl in "${CONTROLS[@]}"; do
    amixer set "$ctrl" 100% unmute 2>/dev/null || \
    amixer set "$ctrl" 100%+ 2>/dev/null || \
    amixer sset "$ctrl" 100% unmute 2>/dev/null || true
done

# Save ALSA settings so volume stays unmuted after reboot
if command -v alsactl >/dev/null 2>&1 && [ "$EUID" -eq 0 ]; then
    alsactl store 2>/dev/null || true
    echo -e "   ✅ Pengaturan volume ALSA disimpan (alsactl store)."
fi

echo -e "\n${GREEN}[3/3] 🔊 Menguji Keluaran Suara ke Lubang AUX STB...${NC}"
echo -e "${YELLOW}📢 Colokkan speaker eksternal ke lubang AUX (3.5mm jack) pada STB Armbian sekarang!${NC}\n"

TEST_TEXT="Halo! Audio aux pada STB Armbian berhasil dikonfigurasi dan siap digunakan!"
TEMP_MP3="/tmp/wifi_aux_test.mp3"

AUDIO_PLAYED=0

# Test online Google TTS if curl is available
if command -v node >/dev/null 2>&1; then
    echo -e "🎙️  Mengunduh suara tes AI TTS via Node.js..."
    node -e "
      const googleTTS = require('google-tts-api');
      const fs = require('fs');
      googleTTS.getAudioBase64('${TEST_TEXT}', { lang: 'id', slow: false })
        .then(base64 => {
          fs.writeFileSync('${TEMP_MP3}', Buffer.from(base64, 'base64'));
          console.log('   ✅ File MP3 suara tes berhasil dibuat.');
        })
        .catch(err => {
          console.log('   ⚠️ Gagal download TTS online:', err.message);
          process.exit(1);
        });
    " 2>/dev/null || true
fi

# Play MP3 test file
if [ -f "$TEMP_MP3" ]; then
    if command -v mpg123 >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}mpg123${NC} (direct ALSA AUX)..."
        mpg123 -q "$TEMP_MP3" 2>/dev/null && AUDIO_PLAYED=1
    elif command -v mpv >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}mpv${NC}..."
        mpv --no-video --really-quiet "$TEMP_MP3" 2>/dev/null && AUDIO_PLAYED=1
    elif command -v ffplay >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}ffplay${NC}..."
        ffplay -nodisp -autoexit -loglevel quiet "$TEMP_MP3" 2>/dev/null && AUDIO_PLAYED=1
    elif command -v gst-play-1.0 >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}gst-play-1.0${NC}..."
        gst-play-1.0 --no-interactive "$TEMP_MP3" 2>/dev/null && AUDIO_PLAYED=1
    fi
    rm -f "$TEMP_MP3" 2>/dev/null || true
fi

# Offline fallback if MP3 playback failed
if [ "$AUDIO_PLAYED" -eq 0 ]; then
    echo -e "▶️  Memutar suara tes fallback offline dengan ${CYAN}espeak + aplay${NC}..."
    if command -v espeak >/dev/null 2>&1 && command -v aplay >/dev/null 2>&1; then
        espeak -v id+f3 -p 60 -s 140 "$TEST_TEXT" --stdout 2>/dev/null | aplay -q 2>/dev/null && AUDIO_PLAYED=1
    fi
fi

echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"
if [ "$AUDIO_PLAYED" -eq 1 ]; then
    echo -e "${GREEN}${BOLD}  ✅ SETUP AUDIO AUX BERHASIL! Suara telah dikirim ke speaker.${NC}"
else
    echo -e "${YELLOW}${BOLD}  ⚠️  Pengaturan selesai. Jika suara tidak terdengar:${NC}"
    echo -e "     1. Pastikan jack speaker sudah tercolok pas di lubang AUX STB."
    echo -e "     2. Buka terminal lalu ketik: ${CYAN}alsamixer${NC}"
    echo -e "     3. Gunakan panah atas untuk membesarkan volume Master / Line Out / Headphone."
fi
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
