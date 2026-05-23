#!/usr/bin/env bash
set -euo pipefail

PACKAGER_VERSION="${PACKAGER_VERSION:-v3.2.0}"
BENTO4_VERSION="${BENTO4_VERSION:-1-6-0-641}"
BENTO4_DIR="/opt/bento4"
BENTO4_BASE_URL="https://github.com/axiomatic-systems/Bento4/releases/download/v1.6.0-641"

echo "[media-tools] Installing OS packages..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    python3-venv \
    unzip \
    wget

echo "[media-tools] Installing Shaka Packager ${PACKAGER_VERSION}..."
sudo wget -q \
    "https://github.com/shaka-project/shaka-packager/releases/download/${PACKAGER_VERSION}/packager-linux-x64" \
    -O /usr/local/bin/packager
sudo chmod 0755 /usr/local/bin/packager

echo "[media-tools] Installing Bento4 ${BENTO4_VERSION}..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

wget -q \
    "${BENTO4_BASE_URL}/Bento4-SDK-${BENTO4_VERSION}.x86_64-unknown-linux.zip" \
    -O "${TMP_DIR}/bento4.zip"
unzip -q "${TMP_DIR}/bento4.zip" -d "$TMP_DIR"
sudo rm -rf "$BENTO4_DIR"
sudo mv "${TMP_DIR}/Bento4-SDK-${BENTO4_VERSION}.x86_64-unknown-linux" "$BENTO4_DIR"
sudo ln -sf "${BENTO4_DIR}/bin/mp4dump" /usr/local/bin/mp4dump
sudo ln -sf "${BENTO4_DIR}/bin/mp4info" /usr/local/bin/mp4info

echo "[media-tools] Verifying installs..."
packager -version
ffmpeg -version | sed -n '1p'
mp4dump 2>&1 | sed -n '1p' || true
