import { open } from "@tauri-apps/plugin-dialog";
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

export default function SettingsModal() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const whisper = useStore((s) => s.whisper);
  const locale = useLocale();

  if (!openState) return null;

  async function pickGgufDir() {
    const dir = await open({ directory: true, title: t("settings.ggufDir") }).catch(
      () => null,
    );
    if (typeof dir === "string" && dir) setSettings({ ggufDir: dir });
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
      </div>
    </div>
  );
}
