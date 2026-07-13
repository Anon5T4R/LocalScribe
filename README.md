# LocalScribe

**Transcrição de áudio 100% offline.** Arraste um arquivo (ou grave do microfone), receba o
texto com timestamps sincronizados ao player, edite, exporte e — se quiser — gere resumo, ata
de reunião e tópicos com IA local. Nada sobe pra nuvem, nunca.

Parte da suíte **Local/Taylor** de aplicativos offline-first. Instale pelo
[TaylorHub](https://github.com/Anon5T4R/TaylorHub) ou baixe o instalador na
[última release](https://github.com/Anon5T4R/LocalScribe/releases/latest).

## O que ele faz

- **Transcrição offline** com [whisper.cpp](https://github.com/ggml-org/whisper.cpp):
  modelos ggml oficiais (tiny/base/small/medium, multilíngues e só-inglês) baixados dentro do
  app com verificação de integridade. Idioma automático ou fixo.
- **Qualquer áudio comum**: mp3, wav, m4a/aac, ogg, flac — e o áudio de vídeos mp4/mov.
  A decodificação é Rust puro (symphonia + rubato), sem ffmpeg. O que não abrir aqui, o
  [LocalMedia](https://github.com/Anon5T4R/LocalMedia) converte.
- **Gravação de microfone** com medidor de nível — grave a reunião e transcreva na hora.
- **Fila de arquivos** com progresso real e cancelamento.
- **Player sincronizado**: waveform clicável, clique no segmento pula o áudio, o texto rola
  junto com a reprodução, velocidade 0.75×–2×.
- **Editor de transcript**: corrija o texto mantendo os timestamps; tudo salvo numa
  biblioteca local (SQLite) com busca.
- **Export**: TXT, Markdown (ótimo pro OpenObsidian), **SRT** e **VTT** (vira legenda em
  qualquer player).
- **IA local opcional** (llama.cpp, modelos GGUF seus): resumo, **ata de reunião**, tópicos
  com timestamps e pergunta livre sobre o áudio — com map-reduce pra áudios longos.
- Tema claro/escuro, interface em português.

## Como usar

1. Instale e abra o app.
2. Na primeira transcrição, baixe um modelo em **Modelos** (pra português, comece pelo
   **Base**, 142 MB; o **Small** transcreve melhor).
3. Arraste arquivos pra janela (ou **+ Abrir áudio**, ou **Gravar**).
4. Ao terminar, clique em **Abrir** na fila: edite, ouça, exporte.
5. (Opcional) Painel **✦ IA**: aponte uma pasta com modelos `.gguf` e gere resumo/ata.

> **Privacidade:** áudio, transcrições e modelos ficam na sua máquina. O único acesso à rede
> é o download de modelos que você pedir (Hugging Face).

## Desenvolvimento

Stack: Tauri 2 + React 19 + Vite + TypeScript (front) e Rust (back). Porta dev **1444**.

```bash
npm install
# runtimes locais (uma vez): whisper-cli e llama-server em src-tauri/binaries/
powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1   # Windows
bash scripts/fetch-whisper.sh                                        # Linux
powershell -ExecutionPolicy Bypass -File scripts/fetch-llama.ps1     # Windows
bash scripts/fetch-llama.sh                                          # Linux

npm run tauri dev
npm test          # vitest (front); cargo test roda no CI
```

Release: bump de versão em `package.json` + `src-tauri/tauri.conf.json` +
`src-tauri/Cargo.toml`, tag `vX.Y.Z`, push — o GitHub Actions builda (Windows NSIS + Linux
AppImage) e publica.

## Créditos

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (transcrição) e
  [llama.cpp](https://github.com/ggml-org/llama.cpp) (IA local), de Georgi Gerganov e
  colaboradores.
- Modelos Whisper da OpenAI, convertidos pra ggml (repositório oficial do whisper.cpp no
  Hugging Face).

## Licença

[MIT](LICENSE).
