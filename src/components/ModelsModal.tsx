// Gerência dos modelos de transcrição (ggml oficiais do whisper.cpp, baixados
// do Hugging Face com SHA-1 conferido). Nada vai no instalador — mesma UX de
// modelos da suíte.

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as be from "../lib/backend";
import { t } from "../lib/i18n";
import type { WhisperModel } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function ModelsModal() {
  const open = useUi((s) => s.modelsOpen);
  const setOpen = useUi((s) => s.setModelsOpen);
  const toast = useUi((s) => s.toast);
  const whisper = useStore((s) => s.whisper);
  const dlProgress = useStore((s) => s.dlProgress);
  const refresh = useStore((s) => s.refreshWhisperModels);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  // Login opcional no Hugging Face (mesmo papel do login no GitHub do Hub):
  // sem token o CDN deles pode bloquear downloads anônimos por IP (403).
  const [hfLogged, setHfLogged] = useState(false);
  const [hfToken, setHfToken] = useState("");
  const [hfMsg, setHfMsg] = useState("");

  useEffect(() => {
    if (open) be.hfTokenStatus().then(setHfLogged).catch(() => {});
  }, [open]);

  if (!open) return null;

  async function saveHfToken() {
    try {
      const name = await be.setHfToken(hfToken);
      setHfLogged(true);
      setHfToken("");
      setHfMsg(t("models.tokenSaved", { name }));
    } catch (e) {
      setHfMsg(String(e));
    }
  }

  async function clearHfToken() {
    try {
      await be.setHfToken("");
      setHfLogged(false);
      setHfMsg(t("models.tokenRemoved"));
    } catch (e) {
      setHfMsg(String(e));
    }
  }

  function openHfTokenPage() {
    void openUrl("https://huggingface.co/settings/tokens/new?tokenType=read").catch(() => {});
    setHfMsg(t("models.createTokenMsg"));
  }

  async function download(id: string) {
    setDownloading((d) => ({ ...d, [id]: true }));
    try {
      await be.whisperDownloadModel(id);
      toast("success", t("models.installedToast", { id }));
      await refresh();
    } catch (e) {
      toast("error", String(e));
    } finally {
      setDownloading((d) => ({ ...d, [id]: false }));
    }
  }

  async function remove(id: string) {
    try {
      await be.whisperDeleteModel(id);
      await refresh();
    } catch (e) {
      toast("error", String(e));
    }
  }

  function fmtSize(mb: number) {
    return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }

  function row(m: WhisperModel) {
    const busy = downloading[m.id];
    const pct = dlProgress[m.id] ?? 0;
    return (
      <div key={m.id} className="model-row">
        <label className="model-pick">
          <input
            type="radio"
            name="whisper-model"
            disabled={!m.installed}
            checked={settings.modelId === m.id}
            onChange={() => setSettings({ modelId: m.id })}
          />
          <div>
            <div className="model-label">{m.label}</div>
            <div className="model-size">
              {fmtSize(m.sizeMb)}
              {m.installed && <span className="chip success">{t("models.installed")}</span>}
            </div>
          </div>
        </label>
        <div className="model-actions">
          {busy ? (
            <div className="model-dl">
              <div className="progress">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <button
                className="btn small"
                onClick={() => void be.whisperCancelDownload(m.id)}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : m.installed ? (
            <button className="btn small danger" onClick={() => void remove(m.id)}>
              {t("models.remove")}
            </button>
          ) : (
            <button className="btn small primary" onClick={() => void download(m.id)}>
              {t("models.download")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const multi = whisper.filter((m) => !m.englishOnly);
  const en = whisper.filter((m) => m.englishOnly);

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("models.title")}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <p className="card-hint">
          {t("models.intro")} {t("models.tipBase")} <b>Base</b>.
        </p>
        <div className="model-group">
          <div className="model-group-title">{t("models.multiTitle")}</div>
          {multi.map(row)}
        </div>
        <div className="model-group">
          <div className="model-group-title">{t("models.enTitle")}</div>
          {en.map(row)}
        </div>
        <div className="model-group">
          <div className="model-group-title">{t("models.hfTitle")}</div>
          <p className="card-hint">
            {t("models.hfIntroPre")} <b>{t("models.hfError403")}</b>
            {t("models.hfIntroPost")}
          </p>
          {hfLogged ? (
            <div className="hf-row">
              <span className="chip success">{t("models.tokenConnected")}</span>
              <button className="btn small danger" onClick={() => void clearHfToken()}>
                {t("models.disconnect")}
              </button>
            </div>
          ) : (
            <div className="hf-row">
              <button className="btn small" onClick={openHfTokenPage}>
                {t("models.createToken")}
              </button>
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder={t("models.tokenPlaceholder")}
              />
              <button
                className="btn small primary"
                disabled={!hfToken.trim()}
                onClick={() => void saveHfToken()}
              >
                {t("models.save")}
              </button>
            </div>
          )}
          {hfMsg && <p className="card-hint">{hfMsg}</p>}
        </div>
      </div>
    </div>
  );
}
