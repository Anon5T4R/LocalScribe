/** Formatação de tempos (ms) pra UI e pros formatos de legenda. */

/** "2:05", "1:02:03" — pra durações e posição do player. */
export function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

function hmsParts(ms: number): { h: string; m: string; s: string; frac: string } {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const frac = clamped % 1000;
  const two = (n: number) => String(n).padStart(2, "0");
  return { h: two(h), m: two(m), s: two(s), frac: String(frac).padStart(3, "0") };
}

/** "00:01:02,345" — timestamp SRT (vírgula decimal). */
export function srtTime(ms: number): string {
  const p = hmsParts(ms);
  return `${p.h}:${p.m}:${p.s},${p.frac}`;
}

/** "00:01:02.345" — timestamp VTT (ponto decimal). */
export function vttTime(ms: number): string {
  const p = hmsParts(ms);
  return `${p.h}:${p.m}:${p.s}.${p.frac}`;
}

/** "13/07/2026 15:04" — datas da biblioteca. */
export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
