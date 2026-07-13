import { open } from "@tauri-apps/plugin-dialog";
import { AUDIO_EXTENSIONS } from "../lib/types";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function TopBar() {
  const addFiles = useStore((s) => s.addFiles);
  const close = useStore((s) => s.close);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setModelsOpen = useUi((s) => s.setModelsOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      title: "Abrir áudio",
      filters: [{ name: "Áudio", extensions: AUDIO_EXTENSIONS }],
    }).catch(() => null);
    if (!picked) return;
    addFiles(Array.isArray(picked) ? picked : [picked]);
  }

  function toggleTheme() {
    const cur = settings.theme;
    setSettings({ theme: cur === "dark" ? "light" : "dark" });
  }

  return (
    <header className="topbar">
      <button className="brand" onClick={close} title="Início">
        <span className="brand-mark">✎</span>
        <span className="brand-name">LocalScribe</span>
      </button>
      <div className="topbar-actions">
        <button className="btn primary" onClick={pickFiles}>
          + Abrir áudio
        </button>
        <button className="btn" onClick={() => setModelsOpen(true)}>
          Modelos
        </button>
        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={settings.theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          {settings.theme === "dark" ? "☀" : "🌙"}
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Configurações">
          ⚙
        </button>
      </div>
    </header>
  );
}
