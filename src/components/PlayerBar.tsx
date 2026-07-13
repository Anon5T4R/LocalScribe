// Player do transcript: <audio> escondido tocando o WAV convertido (formato
// que todo webview toca), waveform em canvas com clique-pra-buscar e sync
// bidirecional com a lista de segmentos.

import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fmtDur } from "../lib/time";

const RATES = [0.75, 1, 1.25, 1.5, 2];

interface Props {
  audioPath: string;
  durationMs: number;
  peaks: number[];
  /** Posição atual (ms) — o pai usa pra destacar o segmento ativo. */
  onTime(ms: number): void;
  /** O pai pede seek (clique num segmento). */
  seekTo: number | null;
  onSeekDone(): void;
}

export default function PlayerBar({
  audioPath,
  durationMs,
  peaks,
  onTime,
  seekTo,
  onSeekDone,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);

  const src = audioPath ? convertFileSrc(audioPath) : "";

  // Seek pedido pelo pai (clique num segmento).
  useEffect(() => {
    if (seekTo === null) return;
    const a = audioRef.current;
    if (a) {
      a.currentTime = seekTo / 1000;
      setPos(seekTo);
      onTime(seekTo);
      if (a.paused) void a.play().catch(() => {});
    }
    onSeekDone();
  }, [seekTo, onSeekDone, onTime]);

  // Desenha o waveform (tema-aware via cores computadas do CSS).
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(document.documentElement);
    const base = styles.getPropertyValue("--wave-base").trim() || "#b9c2cf";
    const played = styles.getPropertyValue("--accent").trim() || "#2563eb";

    const n = peaks.length || 1;
    const barW = w / n;
    const playedX = durationMs > 0 ? (pos / durationMs) * w : 0;
    for (let i = 0; i < n; i++) {
      const p = Math.max(0.04, peaks[i] ?? 0);
      const bh = Math.max(2, p * (h - 6));
      const x = i * barW;
      ctx.fillStyle = x <= playedX ? played : base;
      ctx.fillRect(x + barW * 0.15, (h - bh) / 2, Math.max(1, barW * 0.7), bh);
    }
  }, [peaks, pos, durationMs]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [draw]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setFailed(true));
    else a.pause();
  }

  function skip(deltaSec: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(durationMs / 1000, a.currentTime + deltaSec));
  }

  function clickWave(e: React.MouseEvent<HTMLCanvasElement>) {
    const a = audioRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas || durationMs === 0) return;
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    a.currentTime = (frac * durationMs) / 1000;
  }

  function changeRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  // Atalho: espaço tocar/pausar (fora de inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!audioPath) {
    return (
      <div className="player player-empty">
        Áudio não guardado para esta transcrição (ative "manter áudio" nas configurações).
      </div>
    );
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        onTimeUpdate={(e) => {
          const ms = e.currentTarget.currentTime * 1000;
          setPos(ms);
          onTime(ms);
        }}
      />
      <button className="icon-btn play-btn" onClick={toggle} title="Tocar/pausar (espaço)">
        {playing ? "⏸" : "▶"}
      </button>
      <button className="icon-btn" onClick={() => skip(-10)} title="Voltar 10 s">
        ↺10
      </button>
      <button className="icon-btn" onClick={() => skip(10)} title="Avançar 10 s">
        10↻
      </button>
      <canvas ref={canvasRef} className="wave" onClick={clickWave} />
      <span className="player-time">
        {fmtDur(pos)} / {fmtDur(durationMs)}
      </span>
      <button className="btn small" onClick={changeRate} title="Velocidade">
        {rate}×
      </button>
      {failed && <span className="warn-text">áudio indisponível</span>}
    </div>
  );
}
