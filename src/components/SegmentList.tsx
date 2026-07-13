// Lista de segmentos: timestamp clicável (pula o player) + texto editável
// mantendo os timestamps — o editor de transcript do plano.

import { useEffect, useRef } from "react";
import { fmtDur } from "../lib/time";
import type { Segment } from "../lib/types";

interface Props {
  segments: Segment[];
  activeIndex: number;
  follow: boolean;
  onSeek(ms: number): void;
  onEdit(index: number, text: string): void;
}

export default function SegmentList({ segments, activeIndex, follow, onSeek, onEdit }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll pro segmento ativo quando "seguir áudio" está ligado.
  useEffect(() => {
    if (!follow || activeIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-seg="${activeIndex}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, follow]);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  if (segments.length === 0) {
    return <div className="segments-empty">Transcrição vazia.</div>;
  }

  return (
    <div className="segments" ref={listRef}>
      {segments.map((seg, i) => (
        <div key={i} data-seg={i} className={`segment ${i === activeIndex ? "active" : ""}`}>
          <button
            className="segment-time"
            onClick={() => onSeek(seg.start)}
            title="Tocar a partir daqui"
          >
            {fmtDur(seg.start)}
          </button>
          <textarea
            className="segment-text"
            value={seg.text}
            rows={1}
            ref={(el) => {
              if (el) autoGrow(el);
            }}
            onChange={(e) => {
              autoGrow(e.currentTarget);
              onEdit(i, e.target.value);
            }}
          />
        </div>
      ))}
    </div>
  );
}
