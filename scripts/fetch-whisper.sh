#!/usr/bin/env bash
# Instala o whisper-cli (Linux x64) em src-tauri/binaries/whisper.
#
# Diferente do Windows (zip pronto), no Linux COMPILAMOS do fonte no tag da
# release: os binários prontos do projeto são buildados em runner mais novo e
# podem exigir glibc que a máquina do usuário (e o runner ubuntu-22.04 do
# release) não tem. Build CPU básico — sem dependência de GPU.
# Uso: bash scripts/fetch-whisper.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# VERSÃO FIXA (2026-07-18)
#
# Antes perguntava à API qual era a `releases/latest` e compilava aquilo — o
# AppImage saía com um whisper diferente a cada build, sem registro de qual.
# Agora a tag é explícita. Some junto o GH_TOKEN (era só pro rate-limit da API).
#
# Aqui NÃO há sha256: não é download de binário, é `git clone` numa tag e build
# local. O que garante a origem é o próprio tag do repositório oficial. Se um
# dia quisermos travar mais, o caminho é fixar o COMMIT em vez da tag (tag pode
# ser movida; commit não).
#
# PRA ATUALIZAR: trocar o WH_TAG aqui e as constantes do `fetch-whisper.ps1`
# pra MESMA versão — o Windows usa binário pronto, o Linux compila, mas os dois
# têm que entregar a mesma versão do whisper.
# ---------------------------------------------------------------------------
WH_TAG="v1.9.1"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT/src-tauri/binaries/whisper"
mkdir -p "$WHISPER_DIR"

if [ -f "$WHISPER_DIR/whisper-cli" ]; then
  echo "whisper runtime já existe em $WHISPER_DIR"
  exit 0
fi

echo "Compilando whisper.cpp $WH_TAG (whisper-cli estático, CPU)..."

SRC=$(mktemp -d)
git clone --depth 1 --branch "$WH_TAG" https://github.com/ggml-org/whisper.cpp.git "$SRC"
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
echo "Instalado em $WHISPER_DIR ($WH_TAG)"
