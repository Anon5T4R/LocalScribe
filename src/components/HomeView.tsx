import { open } from "@tauri-apps/plugin-dialog";
import { t, type MessageKey } from "../lib/i18n";
import { AUDIO_EXTENSIONS } from "../lib/types";
import { fmtDur } from "../lib/time";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import RecordCard from "./RecordCard";

const STATUS_LABEL: Record<string, MessageKey> = {
  waiting: "home.status.waiting",
  preparing: "home.status.preparing",
  transcribing: "home.status.transcribing",
  done: "home.status.done",
  error: "home.status.error",
  cancelled: "home.status.cancelled",
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
      title: t("topbar.openAudio"),
      filters: [{ name: t("common.audioFilter"), extensions: AUDIO_EXTENSIONS }],
    }).catch(() => null);
    if (!picked) return;
    addFiles(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>{t("home.heroTitle")}</h1>
        <p className="home-sub">{t("home.heroSub")}</p>
      </div>

      {!runtimeOk && (
        <div className="banner warn">
          {t("home.runtimeMissingPre")}{" "}
          <code>scripts/fetch-whisper</code>
          {t("home.runtimeMissingPost")}
        </div>
      )}

      <div className="home-cards">
        <div className="card drop-card" onClick={pickFiles}>
          <div className="drop-icon">📂</div>
          <div className="card-title">{t("home.openAudioTitle")}</div>
          <p className="card-hint">{t("home.openAudioHint")}</p>
        </div>
        <RecordCard />
      </div>

      <div className="home-model-line">
        {t("home.modelLine")}{" "}
        {activeModel?.installed ? (
          <b>{activeModel.label}</b>
        ) : (
          <span className="warn-text">{t("home.noneInstalled")}</span>
        )}
        <button className="btn small" onClick={() => setModelsOpen(true)}>
          {activeModel?.installed ? t("home.change") : t("home.downloadModel")}
        </button>
      </div>

      {queue.length > 0 && (
        <div className="queue">
          <div className="queue-head">
            <h2>{t("home.queue")}</h2>
            {hasFinished && (
              <button className="btn ghost small" onClick={clearFinishedJobs}>
                {t("home.clearFinished")}
              </button>
            )}
          </div>
          {queue.map((j) => (
            <div key={j.id} className={`queue-item ${j.status}`}>
              <div className="queue-item-main">
                <div className="queue-item-name">{j.name}</div>
                <div className="queue-item-status">
                  {t(STATUS_LABEL[j.status])}
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
                    {t("home.open")}
                  </button>
                )}
                {(j.status === "waiting" ||
                  j.status === "preparing" ||
                  j.status === "transcribing") && (
                  <button className="btn small" onClick={() => cancelJob(j.id)}>
                    {t("common.cancel")}
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
