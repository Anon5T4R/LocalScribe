//! Decodificação de áudio em Rust puro: qualquer formato que o symphonia abra
//! (mp3, m4a/aac, ogg/vorbis, flac, wav) vira WAV PCM 16 kHz mono — o formato
//! que o whisper.cpp espera. Sem ffmpeg de propósito (decisão do plano da
//! suíte): mantém o app leve e o CI simples. O que não abrir aqui (ex.: opus,
//! vídeo exótico) recebe uma mensagem honesta apontando o LocalMedia.

use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const WHISPER_RATE: u32 = 16_000;

/// Quantos pontos o waveform da UI recebe (picos por bucket).
const WAVEFORM_BUCKETS: usize = 800;

pub struct DecodedAudio {
    /// Amostras mono f32 já em 16 kHz.
    pub samples: Vec<f32>,
    pub duration_ms: u64,
    /// Picos normalizados (0..1) pra desenhar o waveform na UI.
    pub peaks: Vec<f32>,
}

/// Decodifica um arquivo de áudio pra mono f32 na taxa original.
/// Devolve (samples_mono, sample_rate).
pub fn decode_to_mono(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let file = File::open(path)
        .map_err(|e| format!("não consegui abrir '{}': {}", path.display(), e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| {
            format!(
                "formato de áudio não suportado ({}). Dica: extraia/converta o áudio no LocalMedia e tente de novo.",
                e
            )
        })?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("o arquivo não tem nenhuma faixa de áudio decodificável")?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("codec não suportado ({}). Dica: converta no LocalMedia.", e))?;

    let mut rate: u32 = track.codec_params.sample_rate.unwrap_or(0);
    let mut mono: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            // Fim do stream (ou fim truncado — aceita o que decodificou até aqui).
            Err(SymError::IoError(_)) => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(format!("erro lendo o áudio: {}", e)),
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                if rate == 0 {
                    rate = spec.rate;
                }
                let channels = spec.channels.count().max(1);
                let mut sbuf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                sbuf.copy_interleaved_ref(decoded);
                let samples = sbuf.samples();
                if channels == 1 {
                    mono.extend_from_slice(samples);
                } else {
                    // Média dos canais → mono.
                    for frame in samples.chunks_exact(channels) {
                        let sum: f32 = frame.iter().sum();
                        mono.push(sum / channels as f32);
                    }
                }
            }
            // Pacote corrompido no meio do arquivo: pula e segue.
            Err(SymError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("erro decodificando o áudio: {}", e)),
        }
    }

    if mono.is_empty() || rate == 0 {
        return Err("não consegui decodificar nenhuma amostra de áudio deste arquivo".into());
    }
    Ok((mono, rate))
}

/// Resample mono f32 de `in_rate` pra 16 kHz (rubato, FFT). Identidade se já for 16 kHz.
pub fn resample_to_whisper(samples: Vec<f32>, in_rate: u32) -> Result<Vec<f32>, String> {
    if in_rate == WHISPER_RATE {
        return Ok(samples);
    }
    use rubato::{FftFixedIn, Resampler};

    const CHUNK: usize = 1024;
    let mut rs = FftFixedIn::<f32>::new(in_rate as usize, WHISPER_RATE as usize, CHUNK, 2, 1)
        .map_err(|e| format!("resampler: {}", e))?;

    let mut out: Vec<f32> =
        Vec::with_capacity((samples.len() as u64 * WHISPER_RATE as u64 / in_rate as u64) as usize + CHUNK);
    let mut pos = 0usize;
    while pos < samples.len() {
        let need = rs.input_frames_next();
        if pos + need <= samples.len() {
            let chunk = &samples[pos..pos + need];
            let res = rs
                .process(&[chunk], None)
                .map_err(|e| format!("resampler: {}", e))?;
            out.extend_from_slice(&res[0]);
            pos += need;
        } else {
            // Cauda: processa o resto parcial e termina.
            let chunk = &samples[pos..];
            let res = rs
                .process_partial(Some(&[chunk]), None)
                .map_err(|e| format!("resampler: {}", e))?;
            out.extend_from_slice(&res[0]);
            pos = samples.len();
        }
    }
    Ok(out)
}

/// Calcula os picos do waveform (0..1) em `WAVEFORM_BUCKETS` janelas.
pub fn waveform_peaks(samples: &[f32]) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }
    let buckets = WAVEFORM_BUCKETS.min(samples.len());
    let per = samples.len() as f64 / buckets as f64;
    let mut peaks = Vec::with_capacity(buckets);
    for i in 0..buckets {
        let start = (i as f64 * per) as usize;
        let end = (((i + 1) as f64 * per) as usize).min(samples.len()).max(start + 1);
        let mut max = 0f32;
        for s in &samples[start..end] {
            let a = s.abs();
            if a > max {
                max = a;
            }
        }
        peaks.push((max * 1000.0).round() / 1000.0);
    }
    peaks
}

/// Grava amostras mono 16 kHz num WAV PCM 16-bit.
pub fn write_wav_16k(path: &Path, samples: &[f32]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("criar pasta: {}", e))?;
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: WHISPER_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::create(path, spec).map_err(|e| format!("criar WAV: {}", e))?;
    for s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        writer.write_sample(v).map_err(|e| format!("gravar WAV: {}", e))?;
    }
    writer.finalize().map_err(|e| format!("finalizar WAV: {}", e))?;
    Ok(())
}

/// Pipeline completo: decodifica → resample 16 kHz → grava WAV → picos.
pub fn prepare_file(input: &Path, out_wav: &Path) -> Result<DecodedAudio, String> {
    let (mono, rate) = decode_to_mono(input)?;
    let samples = resample_to_whisper(mono, rate)?;
    let duration_ms = (samples.len() as u64 * 1000) / WHISPER_RATE as u64;
    write_wav_16k(out_wav, &samples)?;
    let peaks = waveform_peaks(&samples);
    Ok(DecodedAudio { samples, duration_ms, peaks })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_identidade_e_downsample() {
        // 1 segundo de senóide 440 Hz em 48 kHz → 16 kHz deve dar ~16000 amostras.
        let sr = 48_000u32;
        let samples: Vec<f32> = (0..sr)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr as f32).sin() * 0.5)
            .collect();
        let out = resample_to_whisper(samples.clone(), sr).unwrap();
        let expected = 16_000f64;
        assert!(
            (out.len() as f64 - expected).abs() < expected * 0.02,
            "esperava ~16000 amostras, veio {}",
            out.len()
        );
        // Identidade: 16 kHz entra, sai igual.
        let same = resample_to_whisper(vec![0.1f32; 1600], WHISPER_RATE).unwrap();
        assert_eq!(same.len(), 1600);
    }

    #[test]
    fn wav_roundtrip_e_peaks() {
        let dir = std::env::temp_dir().join("localscribe-test");
        let wav = dir.join("t.wav");
        let samples: Vec<f32> = (0..16_000)
            .map(|i| (2.0 * std::f32::consts::PI * 220.0 * i as f32 / 16_000.0).sin() * 0.8)
            .collect();
        write_wav_16k(&wav, &samples).unwrap();
        let mut reader = hound::WavReader::open(&wav).unwrap();
        assert_eq!(reader.spec().sample_rate, WHISPER_RATE);
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.duration(), 16_000);
        let first: i16 = reader.samples::<i16>().next().unwrap().unwrap();
        assert_eq!(first, 0);
        let peaks = waveform_peaks(&samples);
        assert_eq!(peaks.len(), 800);
        assert!(peaks.iter().all(|p| *p >= 0.0 && *p <= 1.0));
        assert!(peaks.iter().any(|p| *p > 0.5));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
