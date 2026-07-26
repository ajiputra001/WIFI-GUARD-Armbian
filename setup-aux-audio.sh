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

# Kill any previously running background speaker-test sine wave process
killall -9 speaker-test 2>/dev/null || true

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

# Loop over common ALSA controls on Armbian STBs (Amlogic S905X/P212, Allwinner, Rockchip)
CONTROLS=(
    "Master" "Headphone" "Line Out" "Line" "Audio" "DAC" "PCM" "Speaker" "Output" "Playback"
    "ACODEC" "ACODEC Left" "ACODEC Mute" "ACODEC Play" "ACODEC Ramp" "ACODEC Righ" "ACODEC Unmu" "ACODEC Volu"
    "AIU ACODEC" "AIU HDMI CT" "AIU SPDIF S"
)

for ctrl in "${CONTROLS[@]}"; do
    amixer set "$ctrl" 100% unmute 2>/dev/null || \
    amixer set "$ctrl" 100%+ 2>/dev/null || \
    amixer set "$ctrl" unmute 2>/dev/null || \
    amixer set "$ctrl" on 2>/dev/null || \
    amixer sset "$ctrl" 100% unmute 2>/dev/null || true
done

# Explicit Amlogic S905X P212 soundcard un-mute & DAC routing
amixer sset 'ACODEC' 100% unmute 2>/dev/null || true
amixer sset 'ACODEC Mute' unmute 2>/dev/null || amixer set 'ACODEC Mute' off 2>/dev/null || true
amixer sset 'ACODEC Unmu' unmute 2>/dev/null || amixer set 'ACODEC Unmu' on 2>/dev/null || true
amixer sset 'ACODEC Volu' 100% unmute 2>/dev/null || amixer set 'ACODEC Volu' 100% 2>/dev/null || true
amixer sset 'AIU ACODEC' 100% unmute 2>/dev/null || amixer set 'AIU ACODEC' 100% 2>/dev/null || true
amixer set 'ACODEC Left DAC Sel' 'Left' 2>/dev/null || amixer sset 'ACODEC Left DAC Sel' 'Left' 2>/dev/null || true
amixer set 'ACODEC Right DAC Sel' 'Right' 2>/dev/null || amixer sset 'ACODEC Right DAC Sel' 'Right' 2>/dev/null || true

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

if ! command -v mpg123 >/dev/null 2>&1 && [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}⚡ Menginstall mpg123 (pemutar MP3 ALSA AUX)...${NC}"
    apt-get update -qq && apt-get install -y -qq mpg123 alsa-utils espeak 2>/dev/null || true
fi

# Play MP3 test file across all potential ALSA hardware endpoints (plughw:0,0, hw:0,0, default)
if [ -f "$TEMP_MP3" ]; then
    if command -v mpg123 >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}mpg123 (plughw:0,0 AUX 3.5mm)${NC}..."
        mpg123 -a plughw:0,0 -q "$TEMP_MP3" 2>/dev/null || \
        mpg123 -a hw:0,0 -q "$TEMP_MP3" 2>/dev/null || \
        mpg123 -q "$TEMP_MP3" 2>/dev/null && AUDIO_PLAYED=1
    elif command -v mpv >/dev/null 2>&1; then
        echo -e "▶️  Memutar suara tes dengan ${CYAN}mpv${NC}..."
        mpv --audio-device=alsa/plughw:0,0 --no-video --really-quiet "$TEMP_MP3" 2>/dev/null || \
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
    echo -e "▶️  Memutar suara tes fallback offline dengan ${CYAN}espeak + aplay (plughw:0,0)${NC}..."
    if command -v espeak >/dev/null 2>&1 && command -v aplay >/dev/null 2>&1; then
        espeak -v id+f3 -p 60 -s 140 "$TEST_TEXT" --stdout 2>/dev/null | aplay -D plughw:0,0 -q 2>/dev/null || \
        espeak -v id+f3 -p 60 -s 140 "$TEST_TEXT" --stdout 2>/dev/null | aplay -q 2>/dev/null && AUDIO_PLAYED=1
    fi
fi

echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"
if [ "$AUDIO_PLAYED" -eq 1 ]; then
    echo -e "${GREEN}${BOLD}  ✅ SETUP AUDIO AUX SELESAI! Pengiriman audio ke soundcard S905X berhasil.${NC}"
fi
echo -e "${YELLOW}${BOLD}  📌 TROUBLESHOOTING FISIK LUBANG AUX STB ARMBIAN (S905X):${NC}"
echo -e "     1. ${BOLD}Trik Colokan 3.5mm STB:${NC} Lubang AUX pada STB (HG680P/B860H) adalah colokan AV."
echo -e "        Jika menggunakan kabel jack 3.5mm biasa, coba ${CYAN}TARIK SEDIKIT KELUAR (~1mm)${NC}"
echo -e "        (jangan terlalu dalam/mentok) agar pin Ground & Audio pas menempel."
echo -e "     2. Jika memakai kabel RCA AV (Merah-Kuning-Putih), colokkan jack ke ${CYAN}Kuning / Merah${NC}."
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
