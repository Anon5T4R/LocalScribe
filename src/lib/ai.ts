// IA local: conversa com o llama-server (OpenAI-compat em 127.0.0.1).
// Contrato da suíte: a IA propõe, o código decide o que fazer com o texto.
// Documentos longos passam pelo map-reduce (chunk.ts), portado do padrão
// Writer/LocalPDF, porque o contexto padrão é ~4096 tokens.

import { chunkText } from "./chunk";

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
  if (!res.ok) throw new Error(`IA respondeu ${res.status}`);
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
  if (chunks.length === 0) throw new Error("transcrição vazia");
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
        { role: "user", content: `(parte ${i + 1} de ${chunks.length})\n\n${chunks[i]}` },
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
    "Você resume trechos de uma transcrição de áudio em português. Resuma o trecho em 3-5 frases, mantendo nomes, números e decisões. Não invente nada.",
    "Você resume transcrições de áudio em português. Escreva um resumo claro e fiel (1-3 parágrafos) a partir do conteúdo abaixo. Mantenha nomes, números e decisões. Não invente nada.",
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
    "Você extrai de um trecho de transcrição de reunião (português): assuntos discutidos, decisões tomadas, ações combinadas (com responsável se dito) e prazos. Responda em tópicos curtos. Não invente nada.",
    [
      "Você redige atas de reunião em português, em markdown, a partir do material abaixo.",
      "Estrutura: ## Resumo (2-3 frases) · ## Assuntos discutidos (tópicos) ·",
      "## Decisões (tópicos) · ## Ações e responsáveis (tópicos '- [ ] ação — responsável') ·",
      "## Pendências. Omita seções sem conteúdo. Não invente participantes, decisões nem prazos.",
    ].join(" "),
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
    "Liste em tópicos (markdown '-') os assuntos deste trecho de transcrição, em português. Se as linhas tiverem timestamps [m:ss], inclua o timestamp de onde o assunto começa. Não invente nada.",
    "Consolide as listas abaixo numa única lista de tópicos (markdown '-') sem repetições, em ordem cronológica, mantendo os timestamps [m:ss] quando existirem.",
    onStep,
  );
}

/** Pergunta livre sobre a transcrição (usa o começo + fim se não couber tudo). */
export async function askTranscript(port: number, text: string, question: string): Promise<string> {
  const MAX = 9000;
  let context = text;
  if (text.length > MAX) {
    context =
      text.slice(0, MAX / 2) + "\n\n[... trecho do meio omitido ...]\n\n" + text.slice(-MAX / 2);
  }
  return chat(
    port,
    [
      {
        role: "system",
        content:
          "Você responde perguntas sobre a transcrição de áudio abaixo, em português, citando os timestamps [m:ss] quando ajudarem. Se a resposta não estiver na transcrição, diga isso.\n\n=== TRANSCRIÇÃO ===\n" +
          context,
      },
      { role: "user", content: question },
    ],
    600,
  );
}
