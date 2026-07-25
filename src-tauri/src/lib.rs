mod audio;
mod db;
mod llm;
mod record;
mod storage;
mod whisper;

use std::sync::Mutex;

use tauri::Manager;

use db::Db;

/// Prepara um arquivo de áudio pra transcrição: decodifica, resample 16 kHz e
/// grava o WAV em `app_data/audio/<id>.wav` (que também vira a fonte do player
/// — WAV toca em qualquer webview, o original pode ser um formato que não).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedAudio {
    wav_path: String,
    duration_ms: u64,
    peaks: Vec<f32>,
}

#[tauri::command(async)]
fn prepare_audio(app: tauri::AppHandle, id: String, input_path: String) -> Result<PreparedAudio, String> {
    let out = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data indisponível: {}", e))?
        .join("audio")
        .join(format!("{}.wav", id));
    let decoded = audio::prepare_file(std::path::Path::new(&input_path), &out)?;
    Ok(PreparedAudio {
        wav_path: out.to_string_lossy().to_string(),
        duration_ms: decoded.duration_ms,
        peaks: decoded.peaks,
    })
}

/// Grava texto em disco (exports TXT/MD/SRT/VTT).
#[tauri::command(async)]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    std::fs::write(&path, content).map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}

fn open_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux: o webkit2gtk pinta a janela INTEIRA de branco em várias combinações
    // de driver/compositor — o app sobe, o processo vive, e não há erro pra ler.
    // (Visto num Arch com GNOME/Wayland; o LocalAI já tinha pago o mesmo pedágio.)
    // Como o WebView é o mesmo em toda a suíte, este bloco é IDÊNTICO nos 31 apps.
    // Desliga o renderer DMABUF (suspeito nº 1), o compositing (reforço) e, em
    // Wayland, força XWayland — em AppImage o branco costuma sobreviver aos dois
    // primeiros. Custa aceleração no WebView, e branco é pior que lento.
    // Variável já setada MANDA (inclusive `=0`): quem depurou o próprio sistema
    // não pode ser sobrescrito por nós. Tem que vir ANTES do GTK subir — o
    // webkitgtk lê estas variáveis uma vez só, no arranque.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        let on_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|t| t.eq_ignore_ascii_case("wayland"))
                .unwrap_or(false);
        if on_wayland && std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            open_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Db::default())
        .manage(whisper::WhisperState::default())
        .manage(record::RecorderState::default())
        .manage(Mutex::new(llm::LlmState::default()))
        .setup(|app| {
            let db = app.state::<Db>().inner().clone();
            if let Err(e) = db::open(app.handle(), &db) {
                eprintln!("[localscribe] falha ao abrir o banco: {e}");
                return Err(e.into());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prepare_audio,
            write_text_file,
            whisper::whisper_models,
            whisper::whisper_download_model,
            whisper::whisper_cancel_download,
            whisper::whisper_delete_model,
            whisper::whisper_runtime_ok,
            whisper::hf_token_status,
            whisper::set_hf_token,
            whisper::transcribe,
            whisper::transcribe_cancel,
            record::record_start,
            record::record_status,
            record::record_stop,
            record::record_discard,
            db::transcripts_list,
            db::transcript_get,
            db::transcript_save,
            db::transcript_delete,
            db::settings_get,
            db::settings_set,
            storage::storage_info,
            storage::storage_clear_orphan_audio,
            storage::storage_clear_all_audio,
            storage::storage_clear_unused_models,
            storage::storage_clear_temp,
            llm::list_models,
            llm::start_llm,
            llm::stop_llm,
            llm::llm_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Garante que llama-server e whisper-cli morrem quando o app sai.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Mutex<llm::LlmState>>() {
                    if let Ok(mut s) = state.lock() {
                        if let Some(child) = s.child.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
                if let Some(state) = app_handle.try_state::<whisper::WhisperState>() {
                    whisper::kill_all(&state);
                }
            }
        });
}
