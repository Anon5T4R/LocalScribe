/** Divide texto longo em pedaços pro map-reduce da IA (contexto ~4096 tokens).
 *  Mesma ideia do chunkDocument do Writer/LocalPDF, portada e simplificada:
 *  corta preferencialmente em quebra de linha, senão em fim de frase, senão
 *  em espaço — nunca no meio de uma palavra (exceto palavra > maxChars). */

export function chunkText(text: string, maxChars = 6000): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = window.lastIndexOf("\n");
    if (cut < maxChars * 0.4) {
      const sentence = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
      );
      cut = sentence >= maxChars * 0.4 ? sentence + 1 : cut;
    }
    if (cut < maxChars * 0.4) {
      const space = window.lastIndexOf(" ");
      cut = space > 0 ? space : maxChars;
    }
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter((c) => c.length > 0);
}
