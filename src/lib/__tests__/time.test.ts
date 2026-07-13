import { describe, expect, it } from "vitest";
import { fmtDur, srtTime, vttTime } from "../time";

describe("fmtDur", () => {
  it("formata minutos e horas", () => {
    expect(fmtDur(0)).toBe("0:00");
    expect(fmtDur(65_000)).toBe("1:05");
    expect(fmtDur(3_600_000)).toBe("1:00:00");
    expect(fmtDur(3_723_000)).toBe("1:02:03");
  });
  it("não quebra com negativo", () => {
    expect(fmtDur(-100)).toBe("0:00");
  });
});

describe("srtTime / vttTime", () => {
  it("preenche zeros e milissegundos", () => {
    expect(srtTime(1500)).toBe("00:00:01,500");
    expect(vttTime(1500)).toBe("00:00:01.500");
    expect(srtTime(3_661_007)).toBe("01:01:01,007");
  });
});
