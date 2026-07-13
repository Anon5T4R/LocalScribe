//! Gravação de microfone via cpal → mesmo pipeline do arquivo (mono 16 kHz WAV).
//! O Stream do cpal não é Send, então ele vive numa thread própria que só
//! espera o sinal de parada; as amostras vão num buffer compartilhado.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{Manager, State};

use crate::audio;

struct RecSession {
    stop_tx: Sender<()>,
    buf: Arc<Mutex<Vec<f32>>>,
    rate: u32,
    channels: u16,
    level: Arc<AtomicU32>,
}

#[derive(Default)]
pub struct RecorderState {
    session: Mutex<Option<RecSession>>,
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buf: Arc<Mutex<Vec<f32>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    use cpal::FromSample;
    device.build_input_stream(
        config,
        move |data: &[T], _| {
            let mut max = 0f32;
            if let Ok(mut b) = buf.lock() {
                for s in data {
                    let v = f32::from_sample(*s);
                    b.push(v);
                    let a = v.abs();
                    if a > max {
                        max = a;
                    }
                }
            }
            level.store(max.to_bits(), Ordering::Relaxed);
        },
        |e| eprintln!("[localscribe] erro no stream do microfone: {e}"),
        None,
    )
}

/// Começa a gravar do microfone padrão. Erro se já estiver gravando.
#[tauri::command(async)]
pub fn record_start(state: State<'_, RecorderState>) -> Result<(), String> {
    let mut session = state.session.lock().map_err(|_| "estado corrompido")?;
    if session.is_some() {
        return Err("já existe uma gravação em andamento".into());
    }

    let buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let level = Arc::new(AtomicU32::new(0));
    let (stop_tx, stop_rx) = channel::<()>();
    let (ready_tx, ready_rx) = channel::<Result<(u32, u16), String>>();

    let t_buf = buf.clone();
    let t_level = level.clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                let _ = ready_tx.send(Err("nenhum microfone encontrado".into()));
                return;
            }
        };
        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("microfone sem configuração de entrada: {}", e)));
                return;
            }
        };
        let rate = config.sample_rate().0;
        let channels = config.channels();
        let sample_format = config.sample_format();
        let stream_config: cpal::StreamConfig = config.into();

        let stream = match sample_format {
            cpal::SampleFormat::F32 => build_stream::<f32>(&device, &stream_config, t_buf, t_level),
            cpal::SampleFormat::I16 => build_stream::<i16>(&device, &stream_config, t_buf, t_level),
            cpal::SampleFormat::U16 => build_stream::<u16>(&device, &stream_config, t_buf, t_level),
            other => {
                let _ = ready_tx.send(Err(format!("formato de captura não suportado: {:?}", other)));
                return;
            }
        };
        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("não consegui abrir o microfone: {}", e)));
                return;
            }
        };
        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(format!("não consegui iniciar a captura: {}", e)));
            return;
        }
        let _ = ready_tx.send(Ok((rate, channels)));
        // Segura o stream vivo até o sinal de parada (ou o app cair).
        let _ = stop_rx.recv();
        drop(stream);
    });

    let (rate, channels) = ready_rx
        .recv()
        .map_err(|_| "a thread de gravação morreu antes de responder".to_string())??;

    *session = Some(RecSession { stop_tx, buf, rate, channels, level });
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordStatus {
    recording: bool,
    elapsed_ms: u64,
    /// Pico do último callback (0..1) — alimenta o medidor de nível da UI.
    level: f32,
}

#[tauri::command(async)]
pub fn record_status(state: State<'_, RecorderState>) -> RecordStatus {
    let session = state.session.lock().ok();
    match session.as_ref().and_then(|s| s.as_ref()) {
        Some(s) => {
            let frames = s.buf.lock().map(|b| b.len()).unwrap_or(0) as u64
                / s.channels.max(1) as u64;
            RecordStatus {
                recording: true,
                elapsed_ms: frames * 1000 / s.rate.max(1) as u64,
                level: f32::from_bits(s.level.load(Ordering::Relaxed)),
            }
        }
        None => RecordStatus { recording: false, elapsed_ms: 0, level: 0.0 },
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingResult {
    wav_path: String,
    duration_ms: u64,
    peaks: Vec<f32>,
}

/// Para a gravação e materializa o WAV 16 kHz mono em `app_data/audio/<id>.wav`.
#[tauri::command(async)]
pub fn record_stop(
    app: tauri::AppHandle,
    state: State<'_, RecorderState>,
    id: String,
) -> Result<RecordingResult, String> {
    let session = {
        let mut guard = state.session.lock().map_err(|_| "estado corrompido")?;
        guard.take().ok_or("nenhuma gravação em andamento")?
    };
    let _ = session.stop_tx.send(());
    // Dá um instante pra thread soltar o stream e o último callback assentar.
    std::thread::sleep(std::time::Duration::from_millis(150));

    let raw = session.buf.lock().map_err(|_| "buffer corrompido")?.clone();
    let channels = session.channels.max(1) as usize;
    if raw.len() / channels < (session.rate / 4) as usize {
        return Err("gravação curta demais (menos de meio segundo)".into());
    }

    let mono: Vec<f32> = if channels == 1 {
        raw
    } else {
        raw.chunks_exact(channels).map(|f| f.iter().sum::<f32>() / channels as f32).collect()
    };
    let samples = audio::resample_to_whisper(mono, session.rate)?;
    let duration_ms = (samples.len() as u64 * 1000) / audio::WHISPER_RATE as u64;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data indisponível: {}", e))?
        .join("audio");
    let wav = dir.join(format!("{}.wav", id));
    audio::write_wav_16k(&wav, &samples)?;
    let peaks = audio::waveform_peaks(&samples);

    Ok(RecordingResult { wav_path: wav.to_string_lossy().to_string(), duration_ms, peaks })
}

/// Descarta a gravação em andamento sem salvar nada.
#[tauri::command(async)]
pub fn record_discard(state: State<'_, RecorderState>) {
    if let Ok(mut guard) = state.session.lock() {
        if let Some(s) = guard.take() {
            let _ = s.stop_tx.send(());
        }
    }
}
