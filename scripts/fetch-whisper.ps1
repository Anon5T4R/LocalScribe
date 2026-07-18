# Baixa o build Windows x64 do whisper.cpp e instala em
# src-tauri/binaries/whisper (whisper-cli.exe + DLLs).
# Build CPU básico — hardware alvo modesto, sem dependência de GPU.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# VERSÃO FIXA + SHA256 (2026-07-18)
#
# Antes varria as releases recentes pela API e pegava a primeira com o asset:
# whisper-cli diferente a cada build, sem registro e sem verificação. Mesma
# passada que fixou ffmpeg e llama.cpp na suíte.
#
# Com a tag fixa saem o laço de tentativas, o sleep e o GH_TOKEN — existiam só
# porque release recém-publicada fica incompleta, o que não é problema numa tag
# que já está pronta.
#
# PRA ATUALIZAR: pegar a tag em github.com/ggml-org/whisper.cpp/releases, baixar
# o asset, rodar `sha256sum`, trocar as constantes — e atualizar o WH_TAG do
# `fetch-whisper.sh` pra MESMA versão (lá é build do fonte, não binário pronto).
# ---------------------------------------------------------------------------
$whTag = "v1.9.1"
$whAsset = "whisper-bin-x64.zip"
$whSha256 = "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539"

$root = Split-Path -Parent $PSScriptRoot
$whisperDir = Join-Path $root "src-tauri\binaries\whisper"
New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null

if (Test-Path (Join-Path $whisperDir "whisper-cli.exe")) {
    Write-Host "whisper runtime já existe em $whisperDir"
    exit 0
}

$url = "https://github.com/ggml-org/whisper.cpp/releases/download/$whTag/$whAsset"
Write-Host "Baixando $url ..."
$zip = Join-Path $env:TEMP $whAsset
Invoke-WebRequest -Uri $url -OutFile $zip

# Confere ANTES de extrair: binário adulterado não chega a ser descompactado.
$got = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
if ($got -ne $whSha256) {
    Remove-Item $zip -Force
    throw "SHA256 NAO BATE!`n  esperado: $whSha256`n  recebido: $got`nDownload corrompido ou adulterado. Nada foi instalado."
}
Write-Host "sha256 conferido: $got"

$extract = Join-Path $env:TEMP "whisper-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force
Remove-Item $zip -Force

# O layout interno do zip muda entre versões — localiza o whisper-cli.exe e
# copia a pasta inteira dele (DLLs do ggml incluídas).
$cli = Get-ChildItem -Path $extract -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
if (-not $cli) { throw "whisper-cli.exe não encontrado dentro do zip ($whTag)" }
Copy-Item -Path (Join-Path $cli.DirectoryName "*") -Destination $whisperDir -Recurse -Force
Remove-Item $extract -Recurse -Force

Write-Host "Instalado em $whisperDir ($whTag)"
