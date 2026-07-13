import { describe, expect, it } from "vitest";
import { chunkText } from "../chunk";

describe("chunkText", () => {
  it("texto curto vira um chunk só", () => {
    expect(chunkText("olá")).toEqual(["olá"]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("corta em quebras de linha sem perder conteúdo", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `linha ${i} com algum texto aqui`);
    const text = lines.join("\n");
    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    // Reconstrução aproximada: nenhum pedaço some.
    const joined = chunks.join("\n");
    for (const l of lines) expect(joined).toContain(l);
  });

  it("não corta no meio de palavra quando há espaços", () => {
    const text = Array.from({ length: 300 }, (_, i) => `palavra${i}`).join(" ");
    const chunks = chunkText(text, 400);
    for (const c of chunks) {
      expect(c.startsWith(" ")).toBe(false);
      expect(c.endsWith(" ")).toBe(false);
    }
    const words = chunks.flatMap((c) => c.split(/\s+/));
    expect(words).toContain("palavra0");
    expect(words).toContain("palavra299");
  });
});
