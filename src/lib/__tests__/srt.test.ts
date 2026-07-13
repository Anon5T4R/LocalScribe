import { describe, expect, it } from "vitest";
import { toMd, toSrt, toTxt, toVtt } from "../srt";
import type { Segment } from "../types";

const segs: Segment[] = [
  { start: 0, end: 4500, text: "Olá, mundo." },
  { start: 4500, end: 65_250, text: "Segundo trecho." },
  { start: 3_600_000, end: 3_661_500, text: "Depois de uma hora." },
];

describe("toSrt", () => {
  it("gera blocos numerados com timestamps de vírgula", () => {
    const out = toSrt(segs);
    expect(out).toBe(
      "1\n00:00:00,000 --> 00:00:04,500\nOlá, mundo.\n\n" +
        "2\n00:00:04,500 --> 00:01:05,250\nSegundo trecho.\n\n" +
        "3\n01:00:00,000 --> 01:01:01,500\nDepois de uma hora.\n",
    );
  });
});

describe("toVtt", () => {
  it("tem cabeçalho WEBVTT e ponto decimal", () => {
    const out = toVtt(segs);
    expect(out.startsWith("WEBVTT\n\n")).toBe(true);
    expect(out).toContain("00:00:04.500 --> 00:01:05.250");
    // Timestamps de VTT usam ponto, nunca vírgula (vírgula no TEXTO é normal).
    const cueLines = out.split("\n").filter((l) => l.includes("-->"));
    expect(cueLines).toHaveLength(3);
    for (const l of cueLines) expect(l).not.toContain(",");
  });
});

describe("toTxt / toMd", () => {
  it("txt é uma linha por segmento", () => {
    expect(toTxt(segs)).toBe("Olá, mundo.\nSegundo trecho.\nDepois de uma hora.\n");
  });
  it("md tem título e timestamps legíveis", () => {
    const out = toMd("Reunião", segs);
    expect(out.startsWith("# Reunião\n")).toBe(true);
    expect(out).toContain("- `[0:04]` Segundo trecho.");
    expect(out).toContain("- `[1:00:00]` Depois de uma hora.");
  });
});
