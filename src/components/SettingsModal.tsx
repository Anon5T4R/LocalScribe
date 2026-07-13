import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

const LANGS: [string, string][] = [
  ["auto", "Detectar automaticamente"],
  ["pt", "Português"],
  ["en", "Inglês"],
  ["es", "Espanhol"],
  ["fr", "Francês"],
  ["de", "Alemão"],
  ["it", "Italiano"],
];

export default function SettingsModal() {
  const openState = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const whisper = useStore((s) => s.whisper);

  if (!openState) return null;

  async function pickGgufDir() {
    const dir = await open({ directory: true, title: "Pasta dos modelos .gguf (IA)" }).catch(
      () => null,
    );
    if (typeof dir === "string" && dir) setSettings({ ggufDir: dir });
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Configurações</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          <label>Tema</label>
          <select
            value={settings.theme}
            onChange={(e) => setSettings({ theme: e.target.value as typeof settings.theme })}
          >
            <option value="system">Seguir o sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>

          <label>Idioma do áudio</label>
          <select
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
          >
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>

          <label>Modelo padrão</label>
          <select
            value={settings.modelId}
            onChange={(e) => setSettings({ modelId: e.target.value })}
          >
            {whisper.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.installed}>
                {m.label}
                {m.installed ? "" : " (não instalado)"}
              </option>
            ))}
          </select>

          <label>Threads da transcrição</label>
          <select
            value={settings.threads}
            onChange={(e) => setSettings({ threads: Number(e.target.value) })}
          >
            <option value={0}>Automático</option>
            {[1, 2, 4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <label>Guardar o áudio convertido</label>
          <div className="form-inline">
            <input
              type="checkbox"
              checked={settings.keepAudio}
              onChange={(e) => setSettings({ keepAudio: e.target.checked })}
            />
            <span className="card-hint">
              permite reouvir o áudio na transcrição (WAV 16 kHz, ~2 MB/min)
            </span>
          </div>

          <label>Pasta dos modelos .gguf (IA)</label>
          <div className="form-inline">
            <span className="ai-dir">{settings.ggufDir || "(não configurada)"}</span>
            <button className="btn small" onClick={pickGgufDir}>
              Escolher…
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
