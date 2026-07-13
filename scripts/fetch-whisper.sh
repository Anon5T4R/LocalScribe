#!/usr/bin/env bash
# Instala o whisper-cli (Linux x64) em src-tauri/binaries/whisper.
#
# Diferente do Windows (zip pronto), no Linux COMPILAMOS do fonte no tag da
# última release, estático (BUILD_SHARED_LIBS=OFF): os binários prontos do
# projeto são buildados em runner mais novo e podem exigir glibc que a máquina
# do usuário (e o runner ubuntu-22.04 do release) não tem. Build CPU básico —
# hardware alvo modesto, sem dependência de GPU.
# Uso: bash scripts/fetch-whisper.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT/src-tauri/binaries/whisper"
mkdir -p "$WHISPER_DIR"

if [ -f "$WHISPER_DIR/whisper-cli" ]; then
  echo "whisper runtime já existe em $WHISPER_DIR"
  exit 0
fi

AUTH=()
[ -n "${GH_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GH_TOKEN")

echo "Descobrindo a última release do whisper.cpp..."
TAG=$(curl -fsSL --retry 3 --retry-delay 2 -H "User-Agent: localscribe-app" "${AUTH[@]}" \
  "https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest" \
  | grep -oE '"tag_name": *"[^"]+"' | head -1 | cut -d'"' -f4)
[ -z "$TAG" ] && { echo "não consegui descobrir a tag da última release"; exit 1; }
echo "Compilando whisper.cpp $TAG (whisper-cli estático, CPU)..."

SRC=$(mktemp -d)
git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/whisper.cpp.git "$SRC"
cmake -S "$SRC" -B "$SRC/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DGGML_NATIVE=OFF
cmake --build "$SRC/build" --config Release -j "$(nproc)" --target whisper-cli

CLI=$(find "$SRC/build" -type f -name whisper-cli | head -1)
[ -z "$CLI" ] && { echo "whisper-cli não saiu do build"; exit 1; }
cp "$CLI" "$WHISPER_DIR/whisper-cli"
chmod +x "$WHISPER_DIR/whisper-cli"
rm -rf "$SRC"
echo "Instalado em $WHISPER_DIR ($TAG)"
