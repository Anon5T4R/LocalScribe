# Baixa o build Windows x64 do whisper.cpp e instala em
# src-tauri/binaries/whisper (whisper-cli.exe + DLLs).
#
# Robustez: como no fetch-llama, varremos as últimas releases e usamos a
# PRIMEIRA que tem o asset (release recém-publicada pode estar incompleta).
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$whisperDir = Join-Path $root "src-tauri\binaries\whisper"
New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null

if (Test-Path (Join-Path $whisperDir "whisper-cli.exe")) {
    Write-Host "whisper runtime já existe em $whisperDir"
    exit 0
}

Write-Host "Consultando releases recentes do whisper.cpp..."
$headers = @{ "User-Agent" = "localscribe-app" }
if ($env:GH_TOKEN) { $headers["Authorization"] = "Bearer $env:GH_TOKEN" }

$asset = $null
$tag = ""
foreach ($attempt in 1..3) {
    $rels = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=8" -Headers $headers
    foreach ($rel in $rels) {
        # Build CPU básico — hardware alvo modesto, sem dependência de GPU.
        $hit = $rel.assets | Where-Object { $_.name -match "^whisper-bin-x64\.zip$" } | Select-Object -First 1
        if ($hit) { $asset = $hit; $tag = $rel.tag_name; break }
    }
    if ($asset) { break }
    Write-Host "asset whisper-bin-x64.zip ainda não disponível; aguardando 15s..."
    Start-Sleep -Seconds 15
}
if (-not $asset) { throw "asset whisper-bin-x64.zip não encontrado nas últimas releases do whisper.cpp" }

Write-Host "Baixando $($asset.name) do release $tag ($([math]::Round($asset.size/1MB,1)) MB)..."
$zip = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
$extract = Join-Path $env:TEMP "whisper-extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force
Remove-Item $zip -Force

# O layout interno do zip muda entre versões — localiza o whisper-cli.exe e
# copia a pasta inteira dele (DLLs do ggml incluídas).
$cli = Get-ChildItem -Path $extract -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
if (-not $cli) { throw "whisper-cli.exe não encontrado dentro do zip ($tag)" }
Copy-Item -Path (Join-Path $cli.DirectoryName "*") -Destination $whisperDir -Recurse -Force
Remove-Item $extract -Recurse -Force

Write-Host "Instalado em $whisperDir ($tag)"
