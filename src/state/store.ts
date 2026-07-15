// Estado central: biblioteca, transcrição aberta, fila de jobs e configurações.
// A fila roda SEQUENCIAL de propósito (1 whisper por vez — máquina alvo modesta).

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as be from "../lib/backend";
import { t as tr } from "../lib/i18n";
import {
  DEFAULT_SETTINGS,
  type QueueJob,
  type Segment,
  type Settings,
  type Transcript,
  type TranscriptMeta,
  type WhisperModel,
} from "../lib/types";
import { useUi } from "./ui";

function newId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

function fileStem(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

interface Store {
  ready: boolean;
  runtimeOk: boolean;
  metas: TranscriptMeta[];
  current: Transcript | null;
  queue: QueueJob[];
  processing: boolean;
  settings: Settings;
  whisper: WhisperModel[];
  /** Progresso de download por modelo (0..100; -1 = sem download ativo). */
  dlProgress: Record<string, number>;

  init(): Promise<void>;
  refreshMetas(): Promise<void>;
  refreshWhisperModels(): Promise<void>;
  setSettings(patch: Partial<Settings>): void;

  addFiles(paths: string[]): void;
  addRecording(name: string, wavPath: string, durationMs: number, peaks: number[]): void;
  cancelJob(id: string): void;
  clearFinishedJobs(): void;

  open(id: string): Promise<void>;
  close(): void;
  setTitle(title: string): void;
  updateSegment(index: number, text: string): void;
  setSummary(summary: string): void;
  persistCurrent(): Promise<void>;
  deleteTranscript(id: string): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let eventsBound = false;

export const useStore = create<Store>((set, get) => ({
  ready: false,
  runtimeOk: true,
  metas: [],
  current: null,
  queue: [],
  processing: false,
  settings: DEFAULT_SETTINGS,
  whisper: [],
  dlProgress: {},

  async init() {
    if (!be.inTauri()) {
      set({ ready: true, runtimeOk: false });
      return;
    }
    try {
      const raw = await be.settingsGetRaw();
      const parsed = JSON.parse(raw || "{}");
      set({ settings: { ...DEFAULT_SETTINGS, ...parsed } });
    } catch {
      /* usa defaults */
    }
    try {
      set({ runtimeOk: await be.whisperRuntimeOk() });
    } catch {
      set({ runtimeOk: false });
    }
    await get().refreshMetas();
    await get().refreshWhisperModels();

    if (!eventsBound) {
      eventsBound = true;
      await listen<{ jobId: string; pct: number }>("transcribe-progress", (e) => {
        const { jobId, pct } = e.payload;
        set((s) => ({
          queue: s.queue.map((j) =>
            j.id === jobId && j.status === "transcribing" ? { ...j, pct } : j,
          ),
        }));
      });
      await listen<{ id: string; received: number; total: number }>("model-dl", (e) => {
        const { id, received, total } = e.payload;
        const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
        set((s) => ({ dlProgress: { ...s.dlProgress, [id]: pct } }));
      });
    }
    set({ ready: true });
  },

  async refreshMetas() {
    try {
      set({ metas: await be.transcriptsList() });
    } catch {
      /* fora do Tauri */
    }
  },

  async refreshWhisperModels() {
    try {
      set({ whisper: await be.whisperModels() });
    } catch {
      /* fora do Tauri */
    }
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    be.settingsSetRaw(JSON.stringify(settings)).catch(() => {});
  },

  addFiles(paths) {
    if (paths.length === 0) return;
    const jobs: QueueJob[] = paths.map((p) => ({
      id: newId(),
      name: fileStem(p),
      path: p,
      status: "waiting",
      pct: 0,
    }));
    set((s) => ({ queue: [...s.queue, ...jobs] }));
    void runQueue(set, get);
  },

  addRecording(name, wavPath, durationMs, peaks) {
    const job: QueueJob = {
      id: newId(),
      name,
      path: "",
      status: "waiting",
      pct: 0,
      wavPath,
      durationMs,
      peaks,
    };
    set((s) => ({ queue: [...s.queue, job] }));
    void runQueue(set, get);
  },

  cancelJob(id) {
    const job = get().queue.find((j) => j.id === id);
    if (!job) return;
    if (job.status === "waiting") {
      set((s) => ({
        queue: s.queue.map((j) => (j.id === id ? { ...j, status: "cancelled" } : j)),
      }));
    } else if (job.status === "transcribing" || job.status === "preparing") {
      be.transcribeCancel(id).catch(() => {});
      set((s) => ({
        queue: s.queue.map((j) => (j.id === id ? { ...j, status: "cancelled" } : j)),
      }));
    }
  },

  clearFinishedJobs() {
    set((s) => ({
      queue: s.queue.filter(
        (j) => j.status === "waiting" || j.status === "preparing" || j.status === "transcribing",
      ),
    }));
  },

  async open(id) {
    try {
      const t = await be.transcriptGet(id);
      set({ current: t });
    } catch (e) {
      useUi.getState().toast("error", tr("store.openFailed", { e: String(e) }));
    }
  },

  close() {
    set({ current: null });
  },

  setTitle(title) {
    const cur = get().current;
    if (!cur) return;
    set({ current: { ...cur, title } });
    scheduleSave(get);
  },

  updateSegment(index, text) {
    const cur = get().current;
    if (!cur) return;
    const segments = cur.segments.map((s, i) => (i === index ? { ...s, text } : s));
    set({ current: { ...cur, segments } });
    scheduleSave(get);
  },

  setSummary(summary) {
    const cur = get().current;
    if (!cur) return;
    set({ current: { ...cur, summary } });
    scheduleSave(get);
  },

  async persistCurrent() {
    const cur = get().current;
    if (!cur) return;
    try {
      await be.transcriptSave(cur);
      await get().refreshMetas();
    } catch (e) {
      useUi.getState().toast("error", tr("store.saveFailed", { e: String(e) }));
    }
  },

  async deleteTranscript(id) {
    try {
      await be.transcriptDelete(id);
    } catch (e) {
      useUi.getState().toast("error", tr("store.deleteFailed", { e: String(e) }));
      return;
    }
    if (get().current?.id === id) set({ current: null });
    await get().refreshMetas();
  },
}));

function scheduleSave(get: () => Store) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void get().persistCurrent();
  }, 800);
}

type Set = (fn: (s: Store) => Partial<Store>) => void;

function patchJob(set: Set, id: string, patch: Partial<QueueJob>) {
  set((s) => ({ queue: s.queue.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
}

/** Processa a fila em série. Reentrante-safe via flag `processing`. */
async function runQueue(set: Set, get: () => Store) {
  if (get().processing) return;
  set(() => ({ processing: true }));
  const toast = useUi.getState().toast;

  try {
    for (;;) {
      const job = get().queue.find((j) => j.status === "waiting");
      if (!job) break;

      const { settings, whisper } = get();
      const model = whisper.find((m) => m.id === settings.modelId);
      if (!model?.installed) {
        patchJob(set, job.id, {
          status: "error",
          error: tr("store.noModel"),
        });
        useUi.getState().setModelsOpen(true);
        continue;
      }

      const id = job.id;
      try {
        // 1. Preparar o áudio (gravações já chegam prontas).
        let wavPath = job.wavPath ?? "";
        let durationMs = job.durationMs ?? 0;
        let peaks = job.peaks ?? [];
        if (!wavPath) {
          patchJob(set, id, { status: "preparing" });
          const prep = await be.prepareAudio(id, job.path);
          wavPath = prep.wavPath;
          durationMs = prep.durationMs;
          peaks = prep.peaks;
        }
        if ((get().queue.find((j) => j.id === id)?.status ?? "") === "cancelled") continue;

        // 2. Transcrever.
        patchJob(set, id, { status: "transcribing", pct: 0 });
        const lang = settings.language === "auto" ? "auto" : settings.language;
        const res = await be.transcribe(id, wavPath, settings.modelId, lang, settings.threads);
        if ((get().queue.find((j) => j.id === id)?.status ?? "") === "cancelled") continue;

        // 3. Persistir na biblioteca.
        const t: Transcript = {
          id,
          title: job.name,
          sourcePath: job.path,
          audioPath: get().settings.keepAudio ? wavPath : "",
          durationMs,
          language: res.language,
          model: settings.modelId,
          createdMs: Date.now(),
          segments: res.segments as Segment[],
          peaks,
          summary: "",
          notes: "",
        };
        await be.transcriptSave(t);
        await get().refreshMetas();
        patchJob(set, id, { status: "done", pct: 100 });
        toast("success", tr("store.transcriptReady", { name: job.name }));
      } catch (e) {
        const cancelled =
          (get().queue.find((j) => j.id === id)?.status ?? "") === "cancelled";
        if (!cancelled) {
          patchJob(set, id, { status: "error", error: String(e) });
          toast("error", tr("store.jobFailed", { name: job.name, e: String(e) }));
        }
      }
    }
  } finally {
    set(() => ({ processing: false }));
  }
}
