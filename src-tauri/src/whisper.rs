//! Motor de transcrição: whisper.cpp embarcado (binaries/whisper).
//!
//! Desvio consciente do plano: em vez do `whisper-server` (HTTP), usamos o
//! `whisper-cli` POR ARQUIVO — ele dá progresso real (stderr `-pp`),
//! cancelamento limpo (kill) e saída JSON estruturada (`-oj`), três coisas que
//! o server não oferece por requisição. O custo (recarregar o modelo a cada
//! arquivo, ~1-2 s nos modelos pequenos) é irrelevante perto do tempo de
//! transcrição. O zip/build baixado pelos fetch-scripts traz os dois binários.
//!
//! Modelos ggml: baixados do Hugging Face (repositório oficial ggerganov/
//! whisper.cpp) pra `app_data/models`, com SHA-1 conferido contra o manifesto
//! embutido (checksums publicados no models/README.md do whisper.cpp).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use sha1::{Digest, Sha1};
use tauri::{Emitter, Manager, State};

pub struct WhisperState {
    /// Transcrições em andamento, por job id (pra cancelar).
    pub jobs: Mutex<HashMap<String, Child>>,
    /// Downloads em andamento, por model id (flag de cancelamento).
    pub downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for WhisperState {
    fn default() -> Self {
        Self { jobs: Mutex::new(HashMap::new()), downloads: Mutex::new(HashMap::new()) }
    }
}

/// Manifesto dos modelos ggml oficiais (whisper.cpp models/README.md).
/// (id, rótulo, MB aproximados pra UI, sha1 publicado)
const MODELS: &[(&str, &str, u32, &str)] = &[
    ("tiny", "Tiny — multilíngue, o mais rápido", 75, "bd577a113a864445d4c299885e0cb97d4ba92b5f"),
    ("base", "Base — multilíngue, bom custo-benefício", 142, "465707469ff3a37a2b9b8d8f89f2f99de7299dac"),
    ("small", "Small — multilíngue, melhor qualidade", 466, "55356645c2b361a969dfd0ef2c5a50d530afd8d5"),
    ("medium", "Medium — multilíngue, máxima qualidade (lento em CPU)", 1536, "fd9727b6e1217c2f614f9b698455c4ffd82463b4"),
    ("tiny.en", "Tiny (só inglês)", 75, "c78c86eb1a8faa21b369bcd33207cc90d64ae9df"),
    ("base.en", "Base (só inglês)", 142, "137c40403d78fd54d454da0f9bd998f78703390c"),
    ("small.en", "Small (só inglês)", 466, "db8a495a91d927739e50b3fc1cc4c6b8f6c2d022"),
];

fn model_url(id: &str) -> String {
    format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin", id)
}

fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data indisponível: {}", e))?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("criar pasta de modelos: {}", e))?;
    Ok(dir)
}

pub fn model_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("ggml-{}.bin", id)))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModel {
    id: String,
    label: String,
    size_mb: u32,
    installed: bool,
    english_only: bool,
}

/// Lista o manifesto de modelos com o estado de instalação.
#[tauri::command(async)]
pub fn whisper_models(app: tauri::AppHandle) -> Result<Vec<WhisperModel>, String> {
    let dir = models_dir(&app)?;
    Ok(MODELS
        .iter()
        .map(|(id, label, mb, _)| WhisperModel {
            id: id.to_string(),
            label: label.to_string(),
            size_mb: *mb,
            installed: dir.join(format!("ggml-{}.bin", id)).exists(),
            english_only: id.ends_with(".en"),
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Token do Hugging Face (opcional) — mesmo papel do login no GitHub do
// TaylorHub: o CDN do HF bloqueia downloads anônimos por IP quando excede o
// rate limit (403 "Access denied"); autenticado, o limite praticamente some.
// O token fica no cofre do SO (DPAPI/Secret Service), nunca em arquivo.
// ---------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "LocalScribe";
const KEYRING_USER: &str = "huggingface-token";

fn hf_token() -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?;
    entry.get_password().ok().filter(|t| !t.is_empty())
}

/// O token só pode ir pra hosts do próprio Hugging Face: a URL assinada do
/// CDN (pós-redirect) recusa requisição com dois mecanismos de auth, e mandar
/// o token pra host alheio seria vazamento de credencial.
fn is_hf_host(url: &str) -> bool {
    url.strip_prefix("https://")
        .and_then(|rest| rest.split('/').next())
        .map(|h| h == "huggingface.co" || h.ends_with(".huggingface.co"))
        .unwrap_or(false)
}

/// GET seguindo redirects manualmente — o ureq re-enviaria o Authorization
/// em todos os saltos, e aqui ele precisa parar na fronteira do Hugging Face.
fn http_get(url: &str) -> Result<ureq::Response, String> {
    let agent = ureq::AgentBuilder::new().redirects(0).build();
    let mut url = url.to_string();
    for _ in 0..8 {
        let mut req = agent.get(&url);
        if is_hf_host(&url) {
            if let Some(t) = hf_token() {
                req = req.set("Authorization", &format!("Bearer {}", t));
            }
        }
        let resp = req.call().map_err(dl_error)?;
        if (300..400).contains(&resp.status()) {
            let loc =
                resp.header("Location").ok_or("redirect sem Location")?.to_string();
            url = if loc.starts_with("http") {
                loc
            } else if loc.starts_with("//") {
                format!("https:{}", loc)
            } else {
                let origin: String =
                    url.splitn(4, '/').take(3).collect::<Vec<_>>().join("/");
                format!("{}{}", origin, loc)
            };
            continue;
        }
        return Ok(resp);
    }
    Err("redirecionamentos demais".into())
}

/// Traduz o erro HTTP do download pra uma mensagem acionável.
fn dl_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(403, _) if hf_token().is_none() => {
            "download falhou (403): o Hugging Face está limitando downloads anônimos \
             do seu IP — conecte um token gratuito em Modelos e tente de novo"
                .into()
        }
        ureq::Error::Status(403, _) => {
            "download falhou (403): o Hugging Face recusou o acesso mesmo com token — \
             desconecte e reconecte o token em Modelos"
                .into()
        }
        ureq::Error::Status(429, _) => {
            "download falhou (429): muitas requisições — aguarde uns minutos ou \
             conecte um token do Hugging Face em Modelos"
                .into()
        }
        other => format!("download falhou: {}", other),
    }
}

/// Há token guardado? (a UI mostra o estado conectado/desconectado)
#[tauri::command(async)]
pub fn hf_token_status() -> bool {
    hf_token().is_some()
}

/// Salva o token (validando no /api/whoami-v2) ou remove (string vazia).
/// Devolve o nome da conta pra UI confirmar.
#[tauri::command(async)]
pub fn set_hf_token(token: String) -> Result<String, String> {
    let token = token.trim().to_string();
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("cofre do sistema indisponível: {}", e))?;
    if token.is_empty() {
        let _ = entry.delete_credential();
        return Ok(String::new());
    }
    let resp = ureq::get("https://huggingface.co/api/whoami-v2")
        .set("Authorization", &format!("Bearer {}", token))
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(401, _) => {
                "o Hugging Face recusou o token — confira se copiou inteiro".to_string()
            }
            other => format!("validar o token: {}", other),
        })?;
    let raw = resp
        .into_string()
        .map_err(|e| format!("resposta do Hugging Face: {}", e))?;
    let body: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("resposta do Hugging Face: {}", e))?;
    let name = body["name"].as_str().unwrap_or("conta").to_string();
    entry
        .set_password(&token)
        .map_err(|e| format!("guardar no cofre do sistema: {}", e))?;
    Ok(name)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DlProgress {
    id: String,
    received: u64,
    total: u64,
}

/// Baixa um modelo ggml do Hugging Face com progresso (evento `model-dl`) e
/// verificação de SHA-1 contra o manifesto. Grava em `.part` e só renomeia
/// depois de conferido — download interrompido nunca vira modelo "instalado".
#[tauri::command(async)]
pub fn whisper_download_model(
    app: tauri::AppHandle,
    state: State<'_, WhisperState>,
    id: String,
) -> Result<(), String> {
    let (_, _, _, sha1_expected) = MODELS
        .iter()
        .find(|(mid, _, _, _)| *mid == id)
        .ok_or_else(|| format!("modelo desconhecido: {}", id))?;

    let cancel = Arc::new(AtomicBool::new(false));
    state.downloads.lock().map_err(|_| "estado corrompido")?.insert(id.clone(), cancel.clone());

    let result = (|| -> Result<(), String> {
        let dest = model_path(&app, &id)?;
        let part = dest.with_extension("bin.part");

        let resp = http_get(&model_url(&id))?;
        let total: u64 = resp
            .header("Content-Length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let mut reader = resp.into_reader();
        let mut file = std::fs::File::create(&part).map_err(|e| format!("criar arquivo: {}", e))?;
        let mut hasher = Sha1::new();
        let mut buf = [0u8; 65536];
        let mut received: u64 = 0;
        let mut last_emit: u64 = 0;

        loop {
            if cancel.load(Ordering::Relaxed) {
                drop(file);
                let _ = std::fs::remove_file(&part);
                return Err("download cancelado".into());
            }
            let n = reader.read(&mut buf).map_err(|e| format!("download interrompido: {}", e))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| format!("gravar modelo: {}", e))?;
            hasher.update(&buf[..n]);
            received += n as u64;
            // Emite no máximo a cada ~1 MB pra não inundar o front.
            if received - last_emit > 1_000_000 {
                last_emit = received;
                let _ = app.emit("model-dl", DlProgress { id: id.clone(), received, total });
            }
        }
        file.flush().map_err(|e| e.to_string())?;
        drop(file);

        let digest = hasher.finalize();
        let got: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
        if got != *sha1_expected {
            let _ = std::fs::remove_file(&part);
            return Err(format!(
                "checksum não confere (esperado {}, veio {}) — baixe de novo",
                sha1_expected, got
            ));
        }
        std::fs::rename(&part, &dest).map_err(|e| format!("finalizar download: {}", e))?;
        let _ = app.emit("model-dl", DlProgress { id: id.clone(), received, total: received });
        Ok(())
    })();

    if let Ok(mut d) = state.downloads.lock() {
        d.remove(&id);
    }
    result
}

#[tauri::command(async)]
pub fn whisper_cancel_download(state: State<'_, WhisperState>, id: String) {
    if let Ok(d) = state.downloads.lock() {
        if let Some(flag) = d.get(&id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

#[tauri::command(async)]
pub fn whisper_delete_model(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = model_path(&app, &id)?;
    std::fs::remove_file(&path).map_err(|e| format!("remover modelo: {}", e))
}

const WHISPER_CLI_BIN: &str = if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" };

/// Localiza o whisper-cli embarcado. Dev: cwd/binaries/whisper. Prod: resource dir.
fn resolve_whisper_cli(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let rel = format!("binaries/whisper/{}", WHISPER_CLI_BIN);
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&rel));
    }
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join(&rel));
        candidates.push(res.join(format!("whisper/{}", WHISPER_CLI_BIN)));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&rel));
            candidates.push(dir.join(format!("whisper/{}", WHISPER_CLI_BIN)));
        }
    }
    for c in candidates {
        if c.exists() {
            return Ok(c);
        }
    }
    Err("whisper-cli não encontrado (runtime de transcrição ausente)".into())
}

/// O runtime de transcrição está presente? (a UI avisa se não estiver)
#[tauri::command(async)]
pub fn whisper_runtime_ok(app: tauri::AppHandle) -> bool {
    resolve_whisper_cli(&app).is_ok()
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeProgress {
    job_id: String,
    pct: u32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start: u64,
    pub end: u64,
    pub text: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResult {
    pub segments: Vec<Segment>,
    pub language: String,
}

/// Extrai o percentual de linhas tipo "whisper_print_progress_callback: progress =  10%".
fn parse_progress(line: &str) -> Option<u32> {
    let idx = line.find("progress")?;
    let rest = &line[idx..];
    let pct_end = rest.find('%')?;
    let digits: String =
        rest[..pct_end].chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Converte o JSON do whisper-cli (`-oj`) em segmentos (offsets em ms).
fn parse_output_json(raw: &str) -> Result<(Vec<Segment>, String), String> {
    let v: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("JSON do whisper inválido: {}", e))?;
    let language = v
        .pointer("/result/language")
        .and_then(|l| l.as_str())
        .unwrap_or("")
        .to_string();
    let items = v
        .get("transcription")
        .and_then(|t| t.as_array())
        .ok_or("JSON do whisper sem a lista 'transcription'")?;
    let mut segments = Vec::with_capacity(items.len());
    for item in items {
        let from = item.pointer("/offsets/from").and_then(|x| x.as_u64()).unwrap_or(0);
        let to = item.pointer("/offsets/to").and_then(|x| x.as_u64()).unwrap_or(from);
        let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("").trim().to_string();
        if !text.is_empty() {
            segments.push(Segment { start: from, end: to, text });
        }
    }
    Ok((segments, language))
}

/// Transcreve um WAV 16 kHz já preparado. Emite `transcribe-progress` e
/// devolve os segmentos com timestamps. Cancelável via `transcribe_cancel`.
#[tauri::command(async)]
pub fn transcribe(
    app: tauri::AppHandle,
    state: State<'_, WhisperState>,
    job_id: String,
    wav_path: String,
    model_id: String,
    language: String,
    threads: u32,
) -> Result<TranscribeResult, String> {
    let exe = resolve_whisper_cli(&app)?;
    let model = model_path(&app, &model_id)?;
    if !model.exists() {
        return Err(format!("o modelo '{}' não está instalado — baixe em Modelos", model_id));
    }

    let out_dir = std::env::temp_dir().join("localscribe");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("pasta temporária: {}", e))?;
    let out_base = out_dir.join(&job_id);
    let json_path = out_base.with_extension("json");

    let n_threads = if threads == 0 {
        std::thread::available_parallelism().map(|n| n.get().saturating_sub(1).max(1)).unwrap_or(4)
    } else {
        threads as usize
    };
    let lang = if language.is_empty() { "auto".to_string() } else { language };

    let mut cmd = Command::new(&exe);
    cmd.args([
        "-m",
        &model.to_string_lossy(),
        "-f",
        &wav_path,
        "-l",
        &lang,
        "-t",
        &n_threads.to_string(),
        "-oj",
        "-of",
        &out_base.to_string_lossy(),
        "-pp",
    ])
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .stdin(Stdio::null());

    // Não abre janela de console no Windows (CREATE_NO_WINDOW).
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("falha ao iniciar whisper-cli: {}", e))?;
    let stderr = child.stderr.take().ok_or("sem stderr do whisper-cli")?;

    state.jobs.lock().map_err(|_| "estado corrompido")?.insert(job_id.clone(), child);
    let _ = app.emit("transcribe-progress", TranscribeProgress { job_id: job_id.clone(), pct: 0 });

    // Lê o stderr até EOF (fim do processo), repassando o progresso pro front.
    let reader = BufReader::new(stderr);
    let mut last_pct = 0u32;
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if let Some(pct) = parse_progress(&line) {
            if pct > last_pct && pct <= 100 {
                last_pct = pct;
                let _ = app
                    .emit("transcribe-progress", TranscribeProgress { job_id: job_id.clone(), pct });
            }
        }
    }

    // stderr fechou: o processo terminou (ou foi morto pelo cancel).
    let mut child = state
        .jobs
        .lock()
        .map_err(|_| "estado corrompido")?
        .remove(&job_id)
        .ok_or("job sumiu do registro")?;
    let status = child.wait().map_err(|e| format!("esperar whisper-cli: {}", e))?;
    if !status.success() {
        let _ = std::fs::remove_file(&json_path);
        return Err("transcrição interrompida".into());
    }

    let raw = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("não achei a saída do whisper ({}): {}", json_path.display(), e))?;
    let _ = std::fs::remove_file(&json_path);
    let (segments, language) = parse_output_json(&raw)?;
    let _ = app.emit("transcribe-progress", TranscribeProgress { job_id, pct: 100 });
    Ok(TranscribeResult { segments, language })
}

/// Cancela uma transcrição em andamento (mata o whisper-cli do job).
#[tauri::command(async)]
pub fn transcribe_cancel(state: State<'_, WhisperState>, job_id: String) {
    if let Ok(mut jobs) = state.jobs.lock() {
        if let Some(child) = jobs.get_mut(&job_id) {
            let _ = child.kill();
        }
    }
}

/// Mata qualquer whisper-cli vivo (chamado na saída do app).
pub fn kill_all(state: &WhisperState) {
    if let Ok(mut jobs) = state.jobs.lock() {
        for (_, child) in jobs.iter_mut() {
            let _ = child.kill();
        }
        jobs.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progresso_do_stderr() {
        assert_eq!(
            parse_progress("whisper_print_progress_callback: progress =   5%"),
            Some(5)
        );
        assert_eq!(
            parse_progress("whisper_print_progress_callback: progress = 100%"),
            Some(100)
        );
        assert_eq!(parse_progress("whisper_init_from_file..."), None);
        assert_eq!(parse_progress(""), None);
    }

    #[test]
    fn parse_da_saida_json() {
        let raw = r#"{
          "systeminfo": "x",
          "result": { "language": "pt" },
          "transcription": [
            { "timestamps": {"from": "00:00:00,000", "to": "00:00:04,500"},
              "offsets": {"from": 0, "to": 4500}, "text": " Olá, mundo." },
            { "timestamps": {"from": "00:00:04,500", "to": "00:00:07,000"},
              "offsets": {"from": 4500, "to": 7000}, "text": "  " },
            { "offsets": {"from": 7000, "to": 9000}, "text": " Segundo trecho." }
          ]
        }"#;
        let (segs, lang) = parse_output_json(raw).unwrap();
        assert_eq!(lang, "pt");
        assert_eq!(segs.len(), 2); // o segmento vazio cai fora
        assert_eq!(segs[0].start, 0);
        assert_eq!(segs[0].end, 4500);
        assert_eq!(segs[0].text, "Olá, mundo.");
        assert_eq!(segs[1].text, "Segundo trecho.");
    }

    #[test]
    fn token_so_vai_pra_hosts_do_hugging_face() {
        assert!(is_hf_host("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/x.bin"));
        assert!(is_hf_host("https://cdn-lfs.huggingface.co/repos/x"));
        assert!(!is_hf_host("https://cas-bridge.xethub.hf.co/xet-bridge-us/x"));
        assert!(!is_hf_host("https://evil.com/huggingface.co/x"));
        assert!(!is_hf_host("http://huggingface.co/x")); // sem TLS não leva token
    }

    #[test]
    fn manifesto_consistente() {
        for (id, label, mb, sha) in MODELS {
            assert!(!id.is_empty() && !label.is_empty() && *mb > 0);
            assert_eq!(sha.len(), 40, "sha1 de {} com tamanho errado", id);
            assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
            assert!(model_url(id).starts_with("https://huggingface.co/ggerganov/whisper.cpp/"));
        }
    }
}
