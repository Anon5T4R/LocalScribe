// Painel de IA local (llama.cpp na porta 8105+): resumo, ata de reunião,
// tópicos e pergunta livre sobre a transcrição. Mesmo padrão de runtime do
// resto da suíte: o usuário aponta a pasta de modelos .gguf e sobe o servidor.

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { askTranscript, extractTopics, meetingMinutes, summarize } from "../lib/ai";
import { t, type MessageKey } from "../lib/i18n";
import { toPlainWithTimes } from "../lib/srt";
import { useAi } from "../state/airuntime";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";

export default function AiPanel() {
  const current = useStore((s) => s.current);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setSummary = useStore((s) => s.setSummary);
  const toast = useUi((s) => s.toast);

  const ai = useAi();
  const [selModel, setSelModel] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    void ai.refresh();
    if (settings.ggufDir) void ai.loadModels(settings.ggufDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickDir() {
    const dir = await open({ directory: true, title: t("ai.pickDirTitle") }).catch(
      () => null,
    );
    if (typeof dir === "string" && dir) {
      setSettings({ ggufDir: dir });
      await ai.loadModels(dir);
    }
  }

  async function startServer() {
    const path = selModel || ai.models[0]?.path;
    if (!path) return;
    try {
      await ai.start(path, 0);
      toast("success", t("ai.ready"));
    } catch {
      /* erro já vai pro estado */
    }
  }

  async function run(kind: "resumo" | "ata" | "topicos") {
    if (!current || ai.port === 0) return;
    setBusy(kind);
    setResult("");
    setProgress("");
    const text = toPlainWithTimes(current.segments);
    const onStep = (done: number, total: number) =>
      setProgress(total > 1 ? t("ai.step", { done: Math.min(done + 1, total), total }) : "");
    try {
      const out =
        kind === "resumo"
          ? await summarize(ai.port, text, onStep)
          : kind === "ata"
            ? await meetingMinutes(ai.port, text, onStep)
            : await extractTopics(ai.port, text, onStep);
      setResult(out);
    } catch (e) {
      toast("error", t("ai.failed", { e: String(e) }));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function ask() {
    if (!current || ai.port === 0 || !question.trim()) return;
    setBusy("pergunta");
    setResult("");
    try {
      setResult(await askTranscript(ai.port, toPlainWithTimes(current.segments), question));
    } catch (e) {
      toast("error", t("ai.failed", { e: String(e) }));
    } finally {
      setBusy("");
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      toast("success", t("ai.copied"));
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="ai-panel">
      <div className="ai-head">
        <span className="ai-title">✦ {t("ai.title")}</span>
        {ai.port > 0 && <span className="chip accent">{t("ai.port", { n: ai.port })}</span>}
      </div>

      {ai.port === 0 ? (
        <div className="ai-setup">
          <p className="card-hint">
            {t("ai.setupHintPre")} <code>.gguf</code> {t("ai.setupHintPost")}
          </p>
          <button className="btn" onClick={pickDir}>
            {settings.ggufDir ? t("ai.changeDir") : t("ai.chooseDir")}
          </button>
          {settings.ggufDir && <div className="ai-dir">{settings.ggufDir}</div>}
          {ai.models.length > 0 && (
            <>
              <select value={selModel} onChange={(e) => setSelModel(e.target.value)}>
                {ai.models.map((m) => (
                  <option key={m.path} value={m.path}>
                    {m.name} ({m.sizeGb.toFixed(1)} GB)
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={startServer} disabled={ai.starting}>
                {ai.starting ? t("ai.loadingModel") : t("ai.startAi")}
              </button>
            </>
          )}
          {ai.error && <div className="warn-text">{ai.error}</div>}
        </div>
      ) : (
        <>
          <div className="ai-actions">
            <button className="btn" disabled={!!busy} onClick={() => void run("resumo")}>
              {t("ai.summary")}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => void run("ata")}>
              {t("ai.minutes")}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => void run("topicos")}>
              {t("ai.topics")}
            </button>
            <button className="btn ghost small" onClick={() => void ai.stop()}>
              {t("ai.stopAi")}
            </button>
          </div>
          <div className="ai-ask">
            <input
              placeholder={t("ai.askPlaceholder")}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
            />
            <button className="btn" disabled={!!busy || !question.trim()} onClick={() => void ask()}>
              →
            </button>
          </div>
          {busy && (
            <div className="ai-busy">
              {t("ai.generating")} {t(`ai.kind.${busy}` as MessageKey)}…{" "}
              {progress && <span className="text-dim">({progress})</span>}
            </div>
          )}
          {result && (
            <div className="ai-result">
              <pre>{result}</pre>
              <div className="ai-result-actions">
                <button className="btn small" onClick={copyResult}>
                  {t("common.copy")}
                </button>
                <button
                  className="btn small primary"
                  onClick={() => {
                    setSummary(result);
                    toast("success", t("ai.savedAsSummary"));
                  }}
                >
                  {t("ai.saveAsSummary")}
                </button>
              </div>
            </div>
          )}
          {!result && !busy && current?.summary && (
            <div className="ai-result">
              <div className="ai-result-label">{t("ai.savedSummaryLabel")}</div>
              <pre>{current.summary}</pre>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
