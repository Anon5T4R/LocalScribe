// Wrappers dos comandos Rust (Tauri v2: chaves camelCase no invoke).
// Fora do Tauri (dev no navegador puro) os comandos rejeitam com mensagem
// clara, pra UI ainda renderizar.

import { invoke } from "@tauri-apps/api/core";
import type { Segment, Transcript, TranscriptMeta, WhisperModel } from "./types";

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function cmd<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri()) return Promise.reject(new Error(`fora do Tauri: ${name}`));
  return invoke<T>(name, args);
}

// --- pipeline de transcrição ---
export interface PreparedAudio {
  wavPath: string;
  durationMs: number;
  peaks: number[];
}
export interface TranscribeResult {
  segments: Segment[];
  language: string;
}
export const prepareAudio = (id: string, inputPath: string) =>
  cmd<PreparedAudio>("prepare_audio", { id, inputPath });
export const transcribe = (
  jobId: string,
  wavPath: string,
  modelId: string,
  language: string,
  threads: number,
) => cmd<TranscribeResult>("transcribe", { jobId, wavPath, modelId, language, threads });
export const transcribeCancel = (jobId: string) => cmd<void>("transcribe_cancel", { jobId });
export const whisperRuntimeOk = () => cmd<boolean>("whisper_runtime_ok");

// --- modelos whisper ---
export const whisperModels = () => cmd<WhisperModel[]>("whisper_models");
export const whisperDownloadModel = (id: string) => cmd<void>("whisper_download_model", { id });
export const whisperCancelDownload = (id: string) => cmd<void>("whisper_cancel_download", { id });
export const whisperDeleteModel = (id: string) => cmd<void>("whisper_delete_model", { id });

// --- token do Hugging Face (evita o 403 de downloads anônimos) ---
export const hfTokenStatus = () => cmd<boolean>("hf_token_status");
/** Salva (devolve o nome da conta) ou remove (string vazia). */
export const setHfToken = (token: string) => cmd<string>("set_hf_token", { token });

// --- gravação de microfone ---
export interface RecordStatus {
  recording: boolean;
  elapsedMs: number;
  level: number;
}
export interface RecordingResult {
  wavPath: string;
  durationMs: number;
  peaks: number[];
}
export const recordStart = () => cmd<void>("record_start");
export const recordStatus = () => cmd<RecordStatus>("record_status");
export const recordStop = (id: string) => cmd<RecordingResult>("record_stop", { id });
export const recordDiscard = () => cmd<void>("record_discard");

// --- biblioteca ---
export const transcriptsList = () => cmd<TranscriptMeta[]>("transcripts_list");
export const transcriptGet = (id: string) => cmd<Transcript>("transcript_get", { id });
export const transcriptSave = (t: Transcript) => cmd<void>("transcript_save", { t });
export const transcriptDelete = (id: string) => cmd<void>("transcript_delete", { id });

// --- configurações / arquivos ---
export const settingsGetRaw = () => cmd<string>("settings_get");
export const settingsSetRaw = (value: string) => cmd<void>("settings_set", { value });
export const writeTextFile = (path: string, content: string) =>
  cmd<void>("write_text_file", { path, content });

// --- dados e armazenamento ---
export interface StorageInfo {
  dir: string;
  dbBytes: number;
  transcripts: number;
  withSummary: number;
  withAudio: number;
  audioBytes: number;
  audioFiles: number;
  orphanAudioBytes: number;
  orphanAudioFiles: number;
  modelsBytes: number;
  modelsCount: number;
  unusedModelsBytes: number;
  unusedModelsCount: number;
  tempBytes: number;
  tempFiles: number;
}
export interface Freed {
  files: number;
  bytes: number;
}
/** `keepModels`: ids que nunca contam como "não usados" (o modelo padrão). */
export const storageInfo = (keepModels: string[]) =>
  cmd<StorageInfo>("storage_info", { keepModels });
export const storageClearOrphanAudio = () => cmd<Freed>("storage_clear_orphan_audio");
export const storageClearAllAudio = () => cmd<Freed>("storage_clear_all_audio");
export const storageClearUnusedModels = (keepModels: string[]) =>
  cmd<Freed>("storage_clear_unused_models", { keepModels });
export const storageClearTemp = () => cmd<Freed>("storage_clear_temp");

// --- IA (llama-server) ---
export interface ModelInfo {
  name: string;
  path: string;
  sizeGb: number;
}
export interface LlmStatus {
  running: boolean;
  port: number;
  model: string;
}
export const listModels = (dir: string) => cmd<ModelInfo[]>("list_models", { dir });
export const startLlm = (modelPath: string, nGpuLayers: number, ctxSize: number) =>
  cmd<number>("start_llm", { modelPath, nGpuLayers, ctxSize });
export const stopLlm = () => cmd<void>("stop_llm");
export const llmStatus = () => cmd<LlmStatus>("llm_status");
