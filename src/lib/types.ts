/** Segmento de transcrição — tempos em milissegundos. */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptMeta {
  id: string;
  title: string;
  sourcePath: string;
  durationMs: number;
  language: string;
  model: string;
  createdMs: number;
  hasSummary: boolean;
}

export interface Transcript {
  id: string;
  title: string;
  sourcePath: string;
  /** WAV 16 kHz convertido (fonte do player). Vazio se o usuário não guarda áudio. */
  audioPath: string;
  durationMs: number;
  language: string;
  model: string;
  createdMs: number;
  segments: Segment[];
  peaks: number[];
  summary: string;
  notes: string;
}

export type JobStatus =
  | "waiting"
  | "preparing"
  | "transcribing"
  | "done"
  | "error"
  | "cancelled";

export interface QueueJob {
  id: string;
  name: string;
  /** Arquivo original (vazio em gravações de microfone). */
  path: string;
  status: JobStatus;
  pct: number;
  error?: string;
  /** Preenchidos quando o áudio já está preparado (gravação de microfone). */
  wavPath?: string;
  durationMs?: number;
  peaks?: number[];
}

export interface WhisperModel {
  id: string;
  label: string;
  sizeMb: number;
  installed: boolean;
  englishOnly: boolean;
}

export interface Settings {
  theme:
    | "light"
    | "dark"
    | "system"
    | "nature"
    | "darkblue"
    | "calmgreen"
    | "pastelpink"
    | "punkprincess";
  /** Idioma da transcrição ("auto" detecta). */
  language: string;
  /** Modelo whisper padrão (id do manifesto). */
  modelId: string;
  /** 0 = automático. */
  threads: number;
  /** Pasta dos modelos .gguf da IA (llama.cpp). */
  ggufDir: string;
  /** Guardar o WAV convertido pra reouvir depois. */
  keepAudio: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "auto",
  modelId: "base",
  threads: 0,
  ggufDir: "",
  keepAudio: true,
};

/** Extensões que o pipeline symphonia consegue abrir (aac dentro de mp4/mov inclusive). */
export const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "m4b",
  "aac",
  "ogg",
  "oga",
  "flac",
  "mp4",
  "m4v",
  "mov",
  "mka",
  "mkv",
  "webm",
];
