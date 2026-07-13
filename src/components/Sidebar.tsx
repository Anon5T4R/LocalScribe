import { useState } from "react";
import { fmtDate, fmtDur } from "../lib/time";
import { useStore } from "../state/store";

export default function Sidebar() {
  const metas = useStore((s) => s.metas);
  const current = useStore((s) => s.current);
  const openTranscript = useStore((s) => s.open);
  const deleteTranscript = useStore((s) => s.deleteTranscript);
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const filtered = query.trim()
    ? metas.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase()))
    : metas;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <input
          className="sidebar-search"
          placeholder="Buscar na biblioteca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="sidebar-list">
        {filtered.length === 0 && (
          <div className="sidebar-empty">
            {metas.length === 0 ? "Suas transcrições aparecem aqui." : "Nada encontrado."}
          </div>
        )}
        {filtered.map((m) => (
          <div
            key={m.id}
            className={`lib-item ${current?.id === m.id ? "active" : ""}`}
            onClick={() => void openTranscript(m.id)}
          >
            <div className="lib-item-title">{m.title}</div>
            <div className="lib-item-meta">
              <span>{fmtDate(m.createdMs)}</span>
              <span className="chip">{fmtDur(m.durationMs)}</span>
              {m.language && <span className="chip">{m.language}</span>}
              {m.hasSummary && (
                <span className="chip accent" title="Tem resumo de IA">
                  ✦
                </span>
              )}
            </div>
            {confirmId === m.id ? (
              <div className="lib-item-confirm" onClick={(e) => e.stopPropagation()}>
                Excluir?
                <button
                  className="btn danger small"
                  onClick={() => {
                    setConfirmId("");
                    void deleteTranscript(m.id);
                  }}
                >
                  Sim
                </button>
                <button className="btn small" onClick={() => setConfirmId("")}>
                  Não
                </button>
              </div>
            ) : (
              <button
                className="lib-item-del"
                title="Excluir transcrição"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(m.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
