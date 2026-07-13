/** Serialização do transcript pros formatos de saída (TXT, MD, SRT, VTT). */

import { fmtDur, srtTime, vttTime } from "./time";
import type { Segment } from "./types";

/** Texto corrido, um segmento por linha. */
export function toTxt(segments: Segment[]): string {
  return segments.map((s) => s.text).join("\n") + "\n";
}

/** Markdown com timestamps clicáveis (bom pro OpenObsidian). */
export function toMd(title: string, segments: Segment[]): string {
  const lines = segments.map((s) => `- \`[${fmtDur(s.start)}]\` ${s.text}`);
  return `# ${title}\n\n${lines.join("\n")}\n`;
}

/** SubRip (.srt) — vira legenda no LocalPlayer/qualquer player. */
export function toSrt(segments: Segment[]): string {
  return (
    segments
      .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}`)
      .join("\n\n") + "\n"
  );
}

/** WebVTT (.vtt). */
export function toVtt(segments: Segment[]): string {
  const cues = segments
    .map((s) => `${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${cues}\n`;
}

/** Texto com timestamps por segmento — contexto pra IA (resumo/ata/tópicos). */
export function toPlainWithTimes(segments: Segment[]): string {
  return segments.map((s) => `[${fmtDur(s.start)}] ${s.text}`).join("\n");
}
