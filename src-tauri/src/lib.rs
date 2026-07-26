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
    // ── Contorno da tela branca do webkit: REMOVIDO, e o porquê importa ──────
    //
    // Este bloco desligava o renderer DMABUF, desligava o compositing e forçava
    // XWayland, porque o webkit2gtk pintava a janela inteira de branco em
    // Arch/GNOME. Era mitigação às cegas — o comentário dizia "branco é pior que
    // lento" — e custava a aceleração do WebView.
    //
    // A CAUSA foi encontrada em 26/07/2026 e é de EMPACOTAMENTO, não de código:
    // o AppDir do AppImage levava `libwayland-*` do Ubuntu do CI, que brigavam
    // com o Mesa do host e derrubavam o EGL (`EGL_BAD_PARAMETER`). Corrigido em
    // `Anon5T4R/linux-packaging`: as libs que falam com driver/compositor agora
    // vêm do host, e o pacote nativo (pacman/apt) usa o webkit do sistema.
    // Tratar o sintoma deixou de fazer sentido.
    //
    // Remover o forçamento NÃO tira a saída de emergência: estas variáveis são
    // lidas pelo próprio webkitgtk, não por este código. Se a tela branca voltar
    // em alguma combinação de driver, rodar com
    // `WEBKIT_DISABLE_DMABUF_RENDERER=1` continua funcionando — e aí é sinal de
    // que sobrou lib de host em algum AppDir, que é onde se deve olhar.

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
