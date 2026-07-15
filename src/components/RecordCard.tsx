// Gravação de microfone: o áudio é capturado no Rust (cpal) e entra na fila
// já convertido (16 kHz mono). A UI só mostra timer + nível e para/descarta.

import { useEffect, useRef, useState } from "react";
import * as be from "../lib/backend";
import { t } from "../lib/i18n";
import { fmtDur } from "../lib/time";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function RecordCard() {
  const addRecording = useStore((s) => s.addRecording);
  const toast = useUi((s) => s.toast);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const s = await be.recordStatus();
        setElapsed(s.elapsedMs);
        setLevel(s.level);
      } catch {
        /* ignore */
      }
    }, 200);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function start() {
    setBusy(true);
    try {
      await be.recordStart();
      setRecording(true);
      setElapsed(0);
      startPolling();
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    stopPolling();
    try {
      const id = Date.now().toString(36) + "-rec";
      const res = await be.recordStop(id);
      const d = new Date();
      const two = (n: number) => String(n).padStart(2, "0");
      const name = `${t("record.namePrefix")} ${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
      addRecording(name, res.wavPath, res.durationMs, res.peaks);
    } catch (e) {
      toast("error", String(e));
    } finally {
      setRecording(false);
      setElapsed(0);
      setLevel(0);
      setBusy(false);
    }
  }

  async function discard() {
    stopPolling();
    try {
      await be.recordDiscard();
    } catch {
      /* ignore */
    }
    setRecording(false);
    setElapsed(0);
    setLevel(0);
  }

  return (
    <div className={`card record-card ${recording ? "recording" : ""}`}>
      {!recording ? (
        <>
          <div className="card-title">{t("record.title")}</div>
          <p className="card-hint">{t("record.hint")}</p>
          <button className="btn record-btn" onClick={start} disabled={busy}>
            <span className="rec-dot" /> {t("record.record")}
          </button>
        </>
      ) : (
        <>
          <div className="card-title rec-live">
            <span className="rec-dot pulsing" /> {t("record.recording")} — {fmtDur(elapsed)}
          </div>
          <div className="level-meter">
            <div
              className="level-fill"
              style={{ width: `${Math.min(100, Math.round(level * 130))}%` }}
            />
          </div>
          <div className="record-actions">
            <button className="btn primary" onClick={stop} disabled={busy}>
              ■ {t("record.stop")}
            </button>
            <button className="btn ghost" onClick={discard} disabled={busy}>
              {t("record.discard")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
