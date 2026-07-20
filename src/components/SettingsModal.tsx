import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  inTauri,
  storageClearAllAudio,
  storageClearOrphanAudio,
  storageClearTemp,
  storageClearUnusedModels,
  storageInfo,
  type Freed,
  type StorageInfo,
} from "../lib/backend";
import { fmtBytes } from "../lib/bytes";
import { LOCALE_LABELS, type Locale, type MessageKey, setLocale, t, useLocale } from "../lib/i18n";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const LANGS: [string, MessageKey][] = [
  ["auto", "settings.lang.auto"],
  ["pt", "settings.lang.pt"],
  ["en", "settings.lang.en"],
  ["es", "settings.lang.es"],
  ["fr", "settings.lang.fr"],
  ["de", "settings.lang.de"],
  ["it", "settings.lang.it"],
];
const LOCALES: Locale[] = ["pt", "en", "es"];

/** As quatro limpezas do painel; `confirm` é a pergunta que precede cada uma. */
type CleanKind = "orphan" | "audio" | "models" | "temp";
const CONFIRM: Record<CleanKind, MessageKey> = {
  orphan: "storage.confirmOrphan",
  audio: "storage.confirmAudio",
  models: "storage.confirmModels",
  temp: "storage.confirmTemp",
};

export default function SettingsModal() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const toast = useUi((s) => s.toast);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const whisper = useStore((s) => s.whisper);
  const locale = useLocale();

  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [confirm, setConfirm] = useState<CleanKind | null>(null);
  const [busy, setBusy] = useState(false);

  // O modelo padrão nunca conta como "não usado" — apagá-lo deixaria o próximo
  // clique em transcrever sem modelo.
  const keep = settings.modelId ? [settings.modelId] : [];

  const refresh = useCallback(async () => {
    if (!inTauri()) return;
    try {
      setInfo(await storageInfo(settings.modelId ? [settings.modelId] : []));
    } catch (e) {
      toast("error", t("storage.loadFailed", { e: String(e) }));
    }
  }, [settings.modelId, toast]);

  // Remede a cada abertura: o usuário costuma vir aqui logo depois de transcrever.
  useEffect(() => {
    if (openState) void refresh();
    else setConfirm(null);
  }, [openState, refresh]);

  if (!openState) return null;

  async function pickGgufDir() {
    const dir = await open({ directory: true, title: t("settings.ggufDir") }).catch(() => null);
    if (typeof dir === "string" && dir) setSettings({ ggufDir: dir });
  }

  async function run(kind: CleanKind) {
    setConfirm(null);
    setBusy(true);
    try {
      let freed: Freed;
      if (kind === "orphan") freed = await storageClearOrphanAudio();
      else if (kind === "audio") freed = await storageClearAllAudio();
      else if (kind === "models") freed = await storageClearUnusedModels(keep);
      else freed = await storageClearTemp();

      toast(
        "success",
        freed.files === 0
          ? t("storage.nothing")
          : t("storage.freed", { size: fmtBytes(freed.bytes), n: freed.files }),
      );
      // Apagar o áudio zera o audio_path no banco: sem reabrir, a transcrição
      // em tela continuaria com o player apontando pro WAV que não existe mais.
      if (kind === "audio") {
        const store = useStore.getState();
        await store.refreshMetas();
        if (store.current) await store.open(store.current.id);
      }
      await refresh();
    } catch (e) {
      toast("error", t("storage.failed", { e: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("settings.title")}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          <label>{t("settings.language")}</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>

          <label>{t("settings.theme")}</label>
          <select
            value={settings.theme}
            onChange={(e) => setSettings({ theme: e.target.value as typeof settings.theme })}
          >
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
            <option value="nature">{t("settings.themeNature")}</option>
            <option value="darkblue">{t("settings.themeDarkblue")}</option>
            <option value="calmgreen">{t("settings.themeCalmgreen")}</option>
            <option value="pastelpink">{t("settings.themePastelpink")}</option>
            <option value="punkprincess">{t("settings.themePunkprincess")}</option>
          </select>

          <label>{t("settings.audioLanguage")}</label>
          <select
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
          >
            {LANGS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </select>

          <label>{t("settings.defaultModel")}</label>
          <select
            value={settings.modelId}
            onChange={(e) => setSettings({ modelId: e.target.value })}
          >
            {whisper.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.installed}>
                {m.label}
                {m.installed ? "" : t("settings.notInstalled")}
              </option>
            ))}
          </select>

          <label>{t("settings.threads")}</label>
          <select
            value={settings.threads}
            onChange={(e) => setSettings({ threads: Number(e.target.value) })}
          >
            <option value={0}>{t("settings.auto")}</option>
            {[1, 2, 4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <label>{t("settings.keepAudio")}</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.keepAudio}
              onChange={(e) => setSettings({ keepAudio: e.target.checked })}
            />
            <span className="card-hint">{t("settings.keepAudioHint")}</span>
          </div>

          <label>{t("settings.ggufDir")}</label>
          <div className="form-inline">
            <span className="ai-dir">{settings.ggufDir || t("settings.notConfigured")}</span>
            <button className="btn small" onClick={pickGgufDir}>
              {t("settings.choose")}
            </button>
          </div>
        </div>

        {info && (
          <div className="storage">
            <h3 className="model-group-title">{t("storage.section")}</h3>

            <div className="storage-row">
              <div className="storage-label">
                <span>{t("storage.path")}</span>
                <code className="storage-dir" title={info.dir}>
                  {info.dir}
                </code>
              </div>
              <button className="btn small" onClick={() => void openPath(info.dir).catch(() => {})}>
                {t("storage.open")}
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-label">
                <span>
                  {t("storage.db")} — <strong>{fmtBytes(info.dbBytes)}</strong>
                </span>
                <span className="card-hint">
                  {t("storage.dbCounts", {
                    n: info.transcripts,
                    s: info.withSummary,
                    a: info.withAudio,
                  })}
                </span>
                <span className="card-hint">{t("storage.dbHint")}</span>
              </div>
            </div>

            <div className="storage-row">
              <div className="storage-label">
                <span>
                  {t("storage.audio")} — <strong>{fmtBytes(info.audioBytes)}</strong>
                </span>
                <span className="card-hint">
                  {t("storage.audioCounts", {
                    n: info.audioFiles,
                    orphans: info.orphanAudioFiles,
                    orphanSize: fmtBytes(info.orphanAudioBytes),
                  })}
                </span>
                <span className="card-hint">{t("storage.clearOrphanHint")}</span>
              </div>
              <button
                className="btn small"
                disabled={busy || info.orphanAudioFiles === 0}
                onClick={() => setConfirm("orphan")}
              >
                {t("storage.clearOrphan")}
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-label">
                <span>{t("storage.clearAudio")}</span>
                <span className="card-hint">{t("storage.clearAudioHint")}</span>
              </div>
              <button
                className="btn small danger"
                disabled={busy || info.audioFiles === 0}
                onClick={() => setConfirm("audio")}
              >
                {t("storage.delete")}
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-label">
                <span>
                  {t("storage.models")} — <strong>{fmtBytes(info.modelsBytes)}</strong>
                </span>
                <span className="card-hint">
                  {t("storage.modelsCounts", {
                    n: info.modelsCount,
                    unused: info.unusedModelsCount,
                    unusedSize: fmtBytes(info.unusedModelsBytes),
                  })}
                </span>
                <span className="card-hint">{t("storage.clearModelsHint")}</span>
              </div>
              <button
                className="btn small danger"
                disabled={busy || info.unusedModelsCount === 0}
                onClick={() => setConfirm("models")}
              >
                {t("storage.clearModels")}
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-label">
                <span>
                  {t("storage.temp")} — <strong>{fmtBytes(info.tempBytes)}</strong>
                </span>
                <span className="card-hint">
                  {t("storage.tempCounts", { n: info.tempFiles })}
                </span>
                <span className="card-hint">{t("storage.clearTempHint")}</span>
              </div>
              <button
                className="btn small"
                disabled={busy || info.tempFiles === 0}
                onClick={() => setConfirm("temp")}
              >
                {t("storage.clear")}
              </button>
            </div>
          </div>
        )}

        {confirm && (
          <div className="storage-confirm">
            <strong>{t("storage.confirmTitle")}</strong>
            <p>{t(CONFIRM[confirm])}</p>
            <div className="storage-confirm-actions">
              <button className="btn small" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn small danger" onClick={() => void run(confirm)}>
                {t("storage.confirmYes")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
