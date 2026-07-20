import { describe, expect, it } from "vitest";
import { fmtBytes } from "../bytes";

describe("fmtBytes", () => {
  it("usa base 1024 e sobe de unidade", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1024)).toBe("1.0 KB");
    expect(fmtBytes(1_500_000)).toBe("1.4 MB");
    expect(fmtBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
  it("bytes inteiros não ganham decimal", () => {
    expect(fmtBytes(1)).toBe("1 B");
    expect(fmtBytes(1023)).toBe("1023 B");
  });
  it("zero, negativo e NaN viram 0 B", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(-5)).toBe("0 B");
    expect(fmtBytes(Number.NaN)).toBe("0 B");
  });
  it("não estoura da maior unidade", () => {
    expect(fmtBytes(5 * 1024 ** 5)).toBe("5120.0 TB");
  });
});
