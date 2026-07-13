import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import HomeView from "./components/HomeView";
import ModelsModal from "./components/ModelsModal";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import Toasts from "./components/Toasts";
import TopBar from "./components/TopBar";
import TranscriptView from "./components/TranscriptView";
import { inTauri } from "./lib/backend";
import { AUDIO_EXTENSIONS } from "./lib/types";
import { useStore } from "./state/store";
import { useUi } from "./state/ui";

export default function App() {
  const init = useStore((s) => s.init);
  const current = useStore((s) => s.current);
  const addFiles = useStore((s) => s.addFiles);
  const theme = useStore((s) => s.settings.theme);
  const toast = useUi((s) => s.toast);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Tema: claro/escuro/segue o sistema (atributo data-theme na raiz).
  useEffect(() => {
    const root = document.documentElement;
    function apply() {
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
    }
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // Arrastar arquivos pra janela → fila (evento nativo do Tauri).
  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") return;
        if (event.payload.type === "enter") setDragging(true);
        else if (event.payload.type === "leave") setDragging(false);
        else if (event.payload.type === "drop") {
          setDragging(false);
          const paths = event.payload.paths ?? [];
          const audio = paths.filter((p) => {
            const ext = p.split(".").pop()?.toLowerCase() ?? "";
            return AUDIO_EXTENSIONS.includes(ext);
          });
          if (audio.length === 0 && paths.length > 0) {
            toast("error", "Nenhum arquivo de áudio reconhecido nos itens soltos.");
            return;
          }
          addFiles(audio);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [addFiles, toast]);

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">{current ? <TranscriptView /> : <HomeView />}</main>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Solte pra transcrever</div>
        </div>
      )}
      <ModelsModal />
      <SettingsModal />
      <Toasts />
    </div>
  );
}
