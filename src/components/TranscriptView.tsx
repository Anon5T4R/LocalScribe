import { useCallback, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { fmtDate, fmtDur } from "../lib/time";
import { useStore } from "../state/store";
import { useUi } from "../state/ui";
import AiPanel from "./AiPanel";
import ExportMenu from "./ExportMenu";
import PlayerBar from "./PlayerBar";
import SegmentList from "./SegmentList";

export default function TranscriptView() {
  const current = useStore((s) => s.current);
  const close = useStore((s) => s.close);
  const setTitle = useStore((s) => s.setTitle);
  const updateSegment = useStore((s) => s.updateSegment);
  const deleteTranscript = useStore((s) => s.deleteTranscript);
  const aiOpen = useUi((s) => s.aiOpen);
  const setAiOpen = useUi((s) => s.setAiOpen);

  const [posMs, setPosMs] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

  const activeIndex = useMemo(() => {
    if (!current) return -1;
    const segs = current.segments;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (posMs >= segs[i].start) return posMs <= segs[i].end + 400 ? i : -1;
    }
    return -1;
  }, [current, posMs]);

  const onSeekDone = useCallback(() => setSeekTo(null), []);
  const onTime = useCallback((ms: number) => setPosMs(ms), []);

  if (!current) return null;

  return (
    <div className="transcript-view">
      <div className="transcript-main">
        <div className="transcript-head">
          <button className="icon-btn" onClick={close} title={t("transcript.back")}>
            ←
          </button>
          <input
            className="transcript-title"
            value={current.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="transcript-actions">
            <label className="follow-toggle" title={t("transcript.followTitle")}>
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
              />
              {t("transcript.followAudio")}
            </label>
            <ExportMenu transcript={current} />
            <button
              className={`btn ${aiOpen ? "primary" : ""}`}
              onClick={() => setAiOpen(!aiOpen)}
            >
              ✦ {t("transcript.ai")}
            </button>
            {confirmDel ? (
              <>
                <button
                  className="btn danger"
                  onClick={() => void deleteTranscript(current.id)}
                >
                  {t("transcript.deleteConfirm")}
                </button>
                <button className="btn" onClick={() => setConfirmDel(false)}>
                  {t("common.no")}
                </button>
              </>
            ) : (
              <button className="icon-btn" title={t("transcript.deleteTitle")} onClick={() => setConfirmDel(true)}>
                🗑
              </button>
            )}
          </div>
        </div>

        <div className="transcript-meta">
          <span className="chip">{fmtDate(current.createdMs)}</span>
          <span className="chip">{fmtDur(current.durationMs)}</span>
          {current.language && <span className="chip">{t("transcript.langChip", { lang: current.language })}</span>}
          {current.model && <span className="chip">whisper {current.model}</span>}
          {current.sourcePath && (
            <span className="chip path" title={current.sourcePath}>
              {current.sourcePath}
            </span>
          )}
        </div>

        <PlayerBar
          audioPath={current.audioPath}
          durationMs={current.durationMs}
          peaks={current.peaks}
          onTime={onTime}
          seekTo={seekTo}
          onSeekDone={onSeekDone}
        />

        <SegmentList
          segments={current.segments}
          activeIndex={activeIndex}
          follow={follow}
          onSeek={(ms) => setSeekTo(ms)}
          onEdit={updateSegment}
        />
      </div>
      {aiOpen && <AiPanel />}
    </div>
  );
}
