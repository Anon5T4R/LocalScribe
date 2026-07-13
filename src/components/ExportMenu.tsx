// Exportação: TXT / Markdown / SRT / VTT via diálogo de salvar, e cópia pro
// clipboard. O SRT/VTT vira legenda em qualquer player (sinergia LocalPlayer).

import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "../lib/backend";
import { toMd, toSrt, toTxt, toVtt } from "../lib/srt";
import type { Transcript } from "../lib/types";
import { useUi } from "../state/ui";

interface Props {
  transcript: Transcript;
}

export default function ExportMenu({ transcript }: Props) {
  const [open, setOpen] = useState(false);
  const toast = useUi((s) => s.toast);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const safeName = transcript.title.replace(/[\\/:*?"<>|]/g, "-").trim() || "transcricao";

  async function exportAs(ext: string, content: string, label: string) {
    setOpen(false);
    const path = await save({
      title: `Exportar ${label}`,
      defaultPath: `${safeName}.${ext}`,
      filters: [{ name: label, extensions: [ext] }],
    }).catch(() => null);
    if (!path) return;
    try {
      await writeTextFile(path, content);
      toast("success", `Exportado: ${path}`);
    } catch (e) {
      toast("error", String(e));
    }
  }

  async function copyAll() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(toTxt(transcript.segments));
      toast("success", "Texto copiado.");
    } catch (e) {
      toast("error", String(e));
    }
  }

  return (
    <div className="export-menu" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)}>
        Exportar ▾
      </button>
      {open && (
        <div className="menu">
          <button onClick={() => void exportAs("txt", toTxt(transcript.segments), "Texto")}>
            Texto (.txt)
          </button>
          <button
            onClick={() =>
              void exportAs("md", toMd(transcript.title, transcript.segments), "Markdown")
            }
          >
            Markdown (.md) — bom pro OpenObsidian
          </button>
          <button onClick={() => void exportAs("srt", toSrt(transcript.segments), "Legenda SRT")}>
            Legenda (.srt)
          </button>
          <button onClick={() => void exportAs("vtt", toVtt(transcript.segments), "Legenda VTT")}>
            Legenda (.vtt)
          </button>
          <hr />
          <button onClick={copyAll}>Copiar texto</button>
        </div>
      )}
    </div>
  );
}
