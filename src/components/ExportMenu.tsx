// Exportação: TXT / Markdown / SRT / VTT via diálogo de salvar, e cópia pro
// clipboard. O SRT/VTT vira legenda em qualquer player (sinergia LocalPlayer).

import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "../lib/backend";
import { t } from "../lib/i18n";
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
      title: t("export.prefix", { label }),
      defaultPath: `${safeName}.${ext}`,
      filters: [{ name: label, extensions: [ext] }],
    }).catch(() => null);
    if (!path) return;
    try {
      await writeTextFile(path, content);
      toast("success", t("export.exported", { path }));
    } catch (e) {
      toast("error", String(e));
    }
  }

  async function copyAll() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(toTxt(transcript.segments));
      toast("success", t("export.textCopied"));
    } catch (e) {
      toast("error", String(e));
    }
  }

  return (
    <div className="export-menu" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)}>
        {t("export.button")} ▾
      </button>
      {open && (
        <div className="menu">
          <button onClick={() => void exportAs("txt", toTxt(transcript.segments), t("export.txt"))}>
            {t("export.txtMenu")}
          </button>
          <button
            onClick={() =>
              void exportAs("md", toMd(transcript.title, transcript.segments), t("export.md"))
            }
          >
            {t("export.mdMenu")}
          </button>
          <button onClick={() => void exportAs("srt", toSrt(transcript.segments), t("export.srt"))}>
            {t("export.srtMenu")}
          </button>
          <button onClick={() => void exportAs("vtt", toVtt(transcript.segments), t("export.vtt"))}>
            {t("export.vttMenu")}
          </button>
          <hr />
          <button onClick={copyAll}>{t("export.copyText")}</button>
        </div>
      )}
    </div>
  );
}
