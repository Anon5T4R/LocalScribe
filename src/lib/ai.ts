// IA local: conversa com o llama-server (OpenAI-compat em 127.0.0.1).
// Contrato da suíte: a IA propõe, o código decide o que fazer com o texto.
// Documentos longos passam pelo map-reduce (chunk.ts), portado do padrão
// Writer/LocalPDF, porque o contexto padrão é ~4096 tokens.

import { chunkText } from "./chunk";
import { t } from "./i18n";

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(port: number, messages: ChatMsg[], maxTokens = 700): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
      // Desliga o "pensar" dos modelos que suportam (resposta direta).
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!res.ok) throw new Error(t("ai.err.respondedStatus", { status: res.status }));
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

/** Map-reduce genérico: resume cada pedaço e depois consolida. */
async function mapReduce(
  port: number,
  text: string,
  mapSystem: string,
  reduceSystem: string,
  onStep?: (done: number, total: number) => void,
): Promise<string> {
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error(t("ai.err.emptyTranscript"));
  if (chunks.length === 1) {
    onStep?.(0, 1);
    const out = await chat(port, [
      { role: "system", content: reduceSystem },
      { role: "user", content: chunks[0] },
    ]);
    onStep?.(1, 1);
    return out;
  }
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onStep?.(i, chunks.length + 1);
    partials.push(
      await chat(port, [
        { role: "system", content: mapSystem },
        {
          role: "user",
          content: `${t("ai.part", { i: i + 1, total: chunks.length })}\n\n${chunks[i]}`,
        },
      ]),
    );
  }
  onStep?.(chunks.length, chunks.length + 1);
  const out = await chat(port, [
    { role: "system", content: reduceSystem },
    { role: "user", content: partials.join("\n\n---\n\n") },
  ]);
  onStep?.(chunks.length + 1, chunks.length + 1);
  return out;
}

/** Resumo em prosa curta. */
export function summarize(
  port: number,
  text: string,
  onStep?: (done: number, total: number) => void,
): Promise<string> {
  return mapReduce(
    port,
    text,
    t("ai.prompt.summarizeMap"),
    t("ai.prompt.summarizeReduce"),
    onStep,
  );
}

/** Ata de reunião estruturada (markdown). */
export function meetingMinutes(
  port: number,
  text: string,
  onStep?: (done: number, total: number) => void,
): Promise<string> {
  return mapReduce(
    port,
    text,
    t("ai.prompt.minutesMap"),
    t("ai.prompt.minutesReduce"),
    onStep,
  );
}

/** Tópicos/pauta do áudio, com timestamps quando presentes no texto. */
export function extractTopics(
  port: number,
  text: string,
  onStep?: (done: number, total: number) => void,
): Promise<string> {
  return mapReduce(
    port,
    text,
    t("ai.prompt.topicsMap"),
    t("ai.prompt.topicsReduce"),
    onStep,
  );
}

/** Pergunta livre sobre a transcrição (usa o começo + fim se não couber tudo). */
export async function askTranscript(port: number, text: string, question: string): Promise<string> {
  const MAX = 9000;
  let context = text;
  if (text.length > MAX) {
    context =
      text.slice(0, MAX / 2) + `\n\n${t("ai.ask.middleOmitted")}\n\n` + text.slice(-MAX / 2);
  }
  return chat(
    port,
    [
      {
        role: "system",
        content: t("ai.prompt.askSystem") + "\n\n" + t("ai.ask.transcriptHeader") + "\n" + context,
      },
      { role: "user", content: question },
    ],
    600,
  );
}
