import { open } from "@tauri-apps/plugin-dialog";
import { AUDIO_EXTENSIONS } from "../lib/types";
import { fmtDur } from "../lib/time";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import RecordCard from "./RecordCard";

const STATUS_LABEL: Record<string, string> = {
  waiting: "na fila",
  preparing: "preparando áudio…",
  transcribing: "transcrevendo",
  done: "pronto",
  error: "erro",
  cancelled: "cancelado",
};

export default function HomeView() {
  const queue = useStore((s) => s.queue);
  const addFiles = useStore((s) => s.addFiles);
  const cancelJob = useStore((s) => s.cancelJob);
  const clearFinishedJobs = useStore((s) => s.clearFinishedJobs);
  const openTranscript = useStore((s) => s.open);
  const runtimeOk = useStore((s) => s.runtimeOk);
  const settings = useStore((s) => s.settings);
  const whisper = useStore((s) => s.whisper);
  const setModelsOpen = useUi((s) => s.setModelsOpen);

  const activeModel = whisper.find((m) => m.id === settings.modelId);
  const hasFinished = queue.some(
    (j) => j.status === "done" || j.status === "error" || j.status === "cancelled",
  );

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      title: "Abrir áudio",
      filters: [{ name: "Áudio", extensions: AUDIO_EXTENSIONS }],
    }).catch(() => null);
    if (!picked) return;
    addFiles(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>Transcreva áudio sem sair do seu computador</h1>
        <p className="home-sub">
          Arraste arquivos pra cá ou grave do microfone. Tudo 100% offline — nada sobe pra nuvem.
        </p>
      </div>

      {!runtimeOk && (
        <div className="banner warn">
          Runtime de transcrição ausente (whisper-cli). Em desenvolvimento, rode{" "}
          <code>scripts/fetch-whisper</code>; no app instalado isso não deveria acontecer.
        </div>
      )}

      <div className="home-cards">
        <div className="card drop-card" onClick={pickFiles}>
          <div className="drop-icon">📂</div>
          <div className="card-title">Abrir arquivos de áudio</div>
          <p className="card-hint">
            mp3, wav, m4a, ogg, flac… (áudio de vídeo mp4/mov também). Solte os arquivos em
            qualquer lugar da janela.
          </p>
        </div>
        <RecordCard />
      </div>

      <div className="home-model-line">
        Modelo de transcrição:{" "}
        {activeModel?.installed ? (
          <b>{activeModel.label}</b>
        ) : (
          <span className="warn-text">nenhum instalado</span>
        )}
        <button className="btn small" onClick={() => setModelsOpen(true)}>
          {activeModel?.installed ? "trocar" : "baixar modelo"}
        </button>
      </div>

      {queue.length > 0 && (
        <div className="queue">
          <div className="queue-head">
            <h2>Fila</h2>
            {hasFinished && (
              <button className="btn ghost small" onClick={clearFinishedJobs}>
                Limpar concluídos
              </button>
            )}
          </div>
          {queue.map((j) => (
            <div key={j.id} className={`queue-item ${j.status}`}>
              <div className="queue-item-main">
                <div className="queue-item-name">{j.name}</div>
                <div className="queue-item-status">
                  {STATUS_LABEL[j.status]}
                  {j.status === "transcribing" && ` — ${j.pct}%`}
                  {j.durationMs ? ` · ${fmtDur(j.durationMs)}` : ""}
                  {j.error ? ` — ${j.error}` : ""}
                </div>
                {(j.status === "transcribing" || j.status === "preparing") && (
                  <div className="progress">
                    <div
                      className={`progress-fill ${j.status === "preparing" ? "indeterminate" : ""}`}
                      style={j.status === "transcribing" ? { width: `${j.pct}%` } : undefined}
                    />
                  </div>
                )}
              </div>
              <div className="queue-item-actions">
                {j.status === "done" && (
                  <button className="btn small primary" onClick={() => void openTranscript(j.id)}>
                    Abrir
                  </button>
                )}
                {(j.status === "waiting" ||
                  j.status === "preparing" ||
                  j.status === "transcribing") && (
                  <button className="btn small" onClick={() => cancelJob(j.id)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
