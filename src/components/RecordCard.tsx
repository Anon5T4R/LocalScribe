// Gravação de microfone: o áudio é capturado no Rust (cpal) e entra na fila
// já convertido (16 kHz mono). A UI só mostra timer + nível e para/descarta.

import { useEffect, useRef, useState } from "react";
import * as be from "../lib/backend";
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
      const name = `Gravação ${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
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
          <div className="card-title">Gravar do microfone</div>
          <p className="card-hint">Grave uma reunião ou nota de voz e transcreva na hora.</p>
          <button className="btn record-btn" onClick={start} disabled={busy}>
            <span className="rec-dot" /> Gravar
          </button>
        </>
      ) : (
        <>
          <div className="card-title rec-live">
            <span className="rec-dot pulsing" /> Gravando — {fmtDur(elapsed)}
          </div>
          <div className="level-meter">
            <div
              className="level-fill"
              style={{ width: `${Math.min(100, Math.round(level * 130))}%` }}
            />
          </div>
          <div className="record-actions">
            <button className="btn primary" onClick={stop} disabled={busy}>
              ■ Parar e transcrever
            </button>
            <button className="btn ghost" onClick={discard} disabled={busy}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
