import { useEffect, useRef, useState } from "react";
import type { Material, TextRange } from "./schema";
import {
  hints,
  clockLabel,
  dayKey,
  progressFor,
  addRanges,
  subtractRanges,
  isCovered,
  shortParts,
  reviewTarget,
  masteryLabel,
  type Module,
  type PracticeEvent,
} from "./domain";
import { api, audioBlob } from "./api";
import { loadAudio, storeAudio, materialKey, type State } from "./storage";
import { usePracticeClock } from "./usePracticeClock";
import { draftKey, readPracticeDraft } from "./practiceDraft";
const labels = { gen: "跟", bei: "背", song: "诵" };
export function Practice({
  module,
  material,
  state,
  save,
  onClose,
  remember,
  changeSpeed,
}: {
  module: Module;
  material: Material;
  state: State;
  save: (e: PracticeEvent) => boolean;
  onClose: () => void;
  remember: () => void;
  changeSpeed: (n: number) => void;
}) {
  const progress = progressFor(
    state.events,
    module,
    material.id,
    material.version,
    material,
  );
  const persistentDraftKey = draftKey(module, material);
  const [draft] = useState(() =>
    readPracticeDraft(persistentDraftKey, module, material, state.events),
  );
  const restored = draft
    ? progressFor(
        [...state.events, draft],
        module,
        material.id,
        material.version,
        material,
      )
    : progress;
  const timer = usePracticeClock(
    `gbs-draft:${module}:${materialKey(material)}`,
    draft?.seconds ?? 0,
  );
  const [startedAt] = useState(draft?.startedAt ?? new Date().toISOString());
  const [eventId] = useState(draft?.id ?? crypto.randomUUID());
  const finished = useRef(false);
  const remembered = useRef(false);
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const [draftError, setDraftError] = useState("");
  const [resume] = useState({
    position: Math.min(
      Math.floor(restored.position),
      material.segments.length - 1,
    ),
    offset: restored.positionOffset,
  });
  const [target] = useState(() =>
    !draft && module === "bei" && state.settings.reviewSeconds > 0
      ? reviewTarget(state.events, material)
      : null,
  );
  const [position, setPosition] = useState(
    module === "gen"
      ? restored.position
      : target
        ? material.segments.findIndex((s) => s.id === target.segmentId)
        : resume.position,
  );
  const [offset, setOffset] = useState(target?.start ?? resume.offset);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const [masteredRanges, setMasteredRanges] = useState(restored.masteredRanges);
  const [initialRanges] = useState(progress.masteredRanges);
  const [mode, setMode] = useState<"full" | "hint" | "hidden">(
    target ? "hidden" : "full",
  );
  const [peek, setPeek] = useState(false),
    [translation, setTranslation] = useState(false);
  const [review, setReview] = useState(Boolean(target));
  const [reviewStart] = useState(timer.seconds);
  const translationDialog = useRef<HTMLDialogElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const [downloadProgress, setDownloadProgress] = useState("");
  const interacted = useRef(false);
  const beginInteraction = () => {
    if (module !== "gen" && !interacted.current) {
      interacted.current = true;
      timer.start();
    }
  };
  useEffect(() => {
    const footer = footerRef.current,
      page = pageRef.current;
    if (!footer || !page) return;
    const measure = () =>
      page.style.setProperty(
        "--practice-dock-height",
        `${footer.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  const wholeTranslation = material.segments.find((s) =>
    s.translation?.startsWith("本信完整译文（与句子未逐一对齐）"),
  );
  const translationSegment = wholeTranslation ?? material.segments[position];
  const [audioUrl, setAudioUrl] = useState(""),
    [audioError, setAudioError] = useState(""),
    [duration, setDuration] = useState(0),
    [playing, setPlaying] = useState(false),
    [subtitles, setSubtitles] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [a, setA] = useState<number | null>(null),
    [b, setB] = useState<number | null>(null),
    [loop, setLoop] = useState(false),
    [gap, setGap] = useState(0);
  const player = useRef<HTMLAudioElement>(null),
    gapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    loopPaused = useRef(false),
    positionRef = useRef(position);
  positionRef.current = position;
  const audioKey = materialKey(material);
  const audioResume = useRef(restored.position);
  useEffect(() => {
    if (module !== "gen") return;
    let cancelled = false,
      objectUrl = "";
    const controller = new AbortController();
    async function openAudio() {
      try {
        setAudioError("");
        setAudioUrl("");
        setDownloadProgress("");
        let blob = await loadAudio(audioKey);
        if (
          !blob &&
          import.meta.env.DEV &&
          material.id === "xiaolai-expression-local"
        ) {
          const r = await fetch(
            `${import.meta.env.BASE_URL}media/${material.audioFile}`,
            { signal: controller.signal },
          );
          if (!r.ok) throw new Error("本地示例音频尚未准备。");
          blob = await audioBlob(r, setDownloadProgress);
        }
        if (
          !blob &&
          material.audioFile &&
          state.settings.apiUrl &&
          (state.settings.apiUrl.startsWith("/") || state.settings.token)
        ) {
          const r = await api(
            state.settings,
            `/audio/${material.id}/${material.version}`,
            { signal: controller.signal },
          );
          blob = await audioBlob(r, setDownloadProgress);
          // Cache is best effort: a full disk must not prevent this practice from playing.
          try {
            await storeAudio(audioKey, blob);
          } catch {}
        }
        if (!blob)
          throw new Error(
            "本机还没有这份音频。请返回材料页，点击“附上本机音频”。",
          );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setAudioError((e as Error).message);
      }
    }
    void openAudio();
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioKey, audioAttempt]);
  useEffect(() => {
    if (player.current) player.current.playbackRate = state.settings.speed;
  }, [state.settings.speed, audioUrl]);
  useEffect(() => {
    if (module !== "gen") return;
    let frame: number;
    let lastPaint = 0;
    const watch = () => {
      const p = player.current;
      if (p && p.readyState >= 1) {
        positionRef.current = p.currentTime;
        const now = performance.now();
        if (now - lastPaint >= 150) {
          setPosition(p.currentTime);
          lastPaint = now;
        }
        if (
          loop &&
          a !== null &&
          b !== null &&
          p.currentTime >= b &&
          !loopPaused.current
        ) {
          p.currentTime = a;
          if (gap) {
            loopPaused.current = true;
            p.pause();
            gapTimer.current = setTimeout(() => {
              loopPaused.current = false;
              void p.play().catch((e) => {
                if (e instanceof DOMException && e.name === "AbortError")
                  return;
                setAudioError("请点击播放继续。");
              });
            }, gap * 1000);
          }
        }
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [module, loop, a, b, gap]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        if (gapTimer.current) clearTimeout(gapTimer.current);
        loopPaused.current = false;
        player.current?.pause();
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      if (gapTimer.current) clearTimeout(gapTimer.current);
    };
  }, []);
  const goTo = (
    index: number,
    nextOffset = 0,
    scroll = false,
    keepReview = false,
  ) => {
    setPeek(false);
    // A deliberate choice of another clause resumes normal practice at that choice.
    if (review && !keepReview) {
      setReview(false);
      setMode("full");
      setPeek(false);
    }
    setPosition(index);
    setOffset(nextOffset);
    positionRef.current = index;
    offsetRef.current = nextOffset;
    if (scroll)
      requestAnimationFrame(() =>
        document
          .querySelector(
            `[data-segment="${material.segments[index].id}"][data-offset="${nextOffset}"]`,
          )
          ?.scrollIntoView({ block: "center" }),
      );
  };
  const endReview = () => {
    setReview(false);
    setMode("full");
    setPeek(false);
    goTo(resume.position, resume.offset, true);
  };
  useEffect(() => {
    const dialog = translationDialog.current;
    if (translation && dialog && !dialog.open) dialog.showModal();
    else if (!translation && dialog?.open) dialog.close();
  }, [translation]);
  const buildEvent = (completed: boolean): PracticeEvent | null => {
    const seconds = timer.value();
    const savedPosition =
      module !== "gen" && review ? resume.position : positionRef.current;
    const savedOffset =
      module !== "gen" && review ? resume.offset : offsetRef.current;
    const confirmedRanges = subtractRanges(masteredRanges, initialRanges),
      revokedRanges = subtractRanges(initialRanges, masteredRanges);
    const confirmed = confirmedRanges
      .filter(
        (r) =>
          r.start === 0 &&
          r.end ===
            [...material.segments.find((s) => s.id === r.segmentId)!.text]
              .length,
      )
      .map((r) => r.segmentId);
    const revoked = revokedRanges
      .filter(
        (r) =>
          r.start === 0 &&
          r.end ===
            [...material.segments.find((s) => s.id === r.segmentId)!.text]
              .length,
      )
      .map((r) => r.segmentId);
    if (
      seconds > 0 ||
      confirmed.length ||
      revoked.length ||
      confirmedRanges.length ||
      revokedRanges.length ||
      savedPosition !== progress.position ||
      savedOffset !== progress.positionOffset ||
      completed
    ) {
      const now = new Date();
      const e: PracticeEvent = {
        id: eventId,
        kind: seconds > 0 || completed ? "practice" : "correction",
        module,
        materialId: material.id,
        version: material.version,
        startedAt,
        endedAt: now.toISOString(),
        day: dayKey(new Date(startedAt)),
        seconds,
        position: savedPosition,
        ...(module !== "gen" ? { positionOffset: savedOffset } : {}),
        confirmed,
        revoked,
        ...(confirmedRanges.some((r) => !confirmed.includes(r.segmentId))
          ? {
              confirmedRanges: confirmedRanges.filter(
                (r) => !confirmed.includes(r.segmentId),
              ),
            }
          : {}),
        ...(revokedRanges.some((r) => !revoked.includes(r.segmentId))
          ? {
              revokedRanges: revokedRanges.filter(
                (r) => !revoked.includes(r.segmentId),
              ),
            }
          : {}),
        completed,
      };
      return e;
    }
    return null;
  };
  const preserveDraft = () => {
    if (finished.current) return;
    const e = buildEvent(false);
    try {
      if (e) {
        localStorage.setItem(persistentDraftKey, JSON.stringify(e));
        if (!remembered.current) {
          remembered.current = true;
          rememberRef.current();
        }
      } else localStorage.removeItem(persistentDraftKey);
    } catch {
      setDraftError("设备空间不足，草稿暂时无法保存。请先保存并返回。");
    }
  };
  const preserveDraftRef = useRef(preserveDraft);
  preserveDraftRef.current = preserveDraft;
  useEffect(() => {
    preserveDraftRef.current();
  }, [position, offset, masteredRanges, Math.floor(timer.seconds)]);
  useEffect(() => {
    const preserve = () => {
      if (document.hidden) preserveDraftRef.current();
    };
    document.addEventListener("visibilitychange", preserve);
    return () => document.removeEventListener("visibilitychange", preserve);
  }, []);
  const finish = (completed: boolean) => {
    if (finished.current) return;
    timer.pause();
    player.current?.pause();
    if (gapTimer.current) clearTimeout(gapTimer.current);
    const e = buildEvent(completed);
    if (e && !save(e)) {
      preserveDraft();
      return;
    }
    finished.current = true;
    try {
      localStorage.removeItem(persistentDraftKey);
    } catch {}
    timer.reset();
    onClose();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const preserve = () => finishRef.current(false);
    window.addEventListener("pagehide", preserve);
    return () => window.removeEventListener("pagehide", preserve);
  }, []);
  useEffect(() => {
    if (module !== "gen" && (position > 0 || offset > 0 || review))
      goTo(position, offset, true, true);
  }, []);
  const togglePlay = async () => {
    const p = player.current;
    if (!p) return;
    if (playing || loopPaused.current) {
      if (gapTimer.current) clearTimeout(gapTimer.current);
      loopPaused.current = false;
      p.pause();
      timer.pause();
      setPlaying(false);
    } else {
      try {
        await p.play();
      } catch (e) {
        // Pausing while playback is still preparing rejects play() with AbortError.
        // The pause event already stopped the clock; this is a normal user action.
        if (e instanceof DOMException && e.name === "AbortError") return;
        setAudioError(
          "播放暂时失败，可以点击“重试播放”。仍无法播放时，请到材料页重新附上音频。",
        );
      }
    }
  };
  const toggleMastery = (range: TextRange) => {
    setMasteredRanges((old) =>
      isCovered(old, range)
        ? subtractRanges(old, [range])
        : addRanges(old, [range]),
    );
  };
  const currentSegment = material.segments.find(
    (s) =>
      s.start !== undefined &&
      s.end !== undefined &&
      position >= s.start &&
      position < s.end,
  );
  return (
    <main className={`practice-page practice-${module}`} ref={pageRef}>
      <div className="practice-top">
        <button className="text-button" onClick={() => finish(false)}>
          ← 保存并返回
        </button>
        <span className={`module-tag ${module}`}>
          {labels[module]} ·{" "}
          {module === "gen"
            ? "跟住节奏"
            : module === "bei"
              ? "少一点，准一点"
              : "出声读，慢慢来"}
        </span>
      </div>
      <header className="practice-title">
        <p className="eyebrow">{material.author}</p>
        <h1>{material.title}</h1>
        <p className="subtle">
          {module === "gen"
            ? "让原声在前面，你跟在后面。"
            : module === "bei"
              ? "不必背完整篇。只确认你已经背准的部分。"
              : "从上次的地方接着读，读过的也可以再读。"}
        </p>
      </header>
      {draftError && (
        <p className="notice" role="alert">
          {draftError}
        </p>
      )}
      {module === "gen" ? (
        <>
          <section className="audio-room">
            <div
              className={`sound-rings ${playing ? "is-playing" : ""}`}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
              <div>跟</div>
            </div>
            <p className="subtle">跟不上字，先跟住气口和节奏。</p>
            {audioError && (
              <div className="notice" role="alert">
                {audioError}
                <button
                  className="pill"
                  onClick={() => {
                    if (player.current && audioUrl) {
                      setAudioError("");
                      audioResume.current = positionRef.current;
                      setPlaying(false);
                      player.current.load();
                      void togglePlay();
                    } else setAudioAttempt((n) => n + 1);
                  }}
                >
                  {audioUrl ? "重试播放" : "重新加载音频"}
                </button>
              </div>
            )}
            {!audioUrl && !audioError ? (
              <p>正在准备音频… {downloadProgress}</p>
            ) : audioUrl ? (
              <audio
                ref={player}
                src={audioUrl}
                onLoadedMetadata={() => {
                  const p = player.current!;
                  setDuration(p.duration);
                  p.currentTime = Math.min(
                    audioResume.current,
                    Math.max(0, p.duration - 1),
                  );
                }}
                onPlay={() => {
                  setPlaying(true);
                  timer.start();
                }}
                onPause={() => {
                  if (!loopPaused.current) {
                    setPlaying(false);
                    timer.pause();
                  }
                }}
                onEnded={() => {
                  setPlaying(false);
                  timer.pause();
                }}
                onError={() => {
                  setPlaying(false);
                  timer.pause();
                  setAudioError(
                    "音频无法播放，请到材料页换用 MP3 或 M4A 文件。",
                  );
                }}
              />
            ) : null}
            <div className="seek-row">
              <span>{clockLabel(position)}</span>
              <input
                aria-label="音频位置"
                type="range"
                min="0"
                max={duration || 1}
                step="0.1"
                value={position}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (player.current) player.current.currentTime = n;
                  setPosition(n);
                }}
              />
              <span>{clockLabel(duration)}</span>
            </div>
            <div className="player-options">
              <label>
                语速{" "}
                <select
                  aria-label="播放速度"
                  value={state.settings.speed}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                >
                  {[0.65, 0.8, 1, 1.15, 1.3].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`pill ${subtitles ? "selected" : ""}`}
                onClick={() => setSubtitles(!subtitles)}
              >
                字幕
                {material.segments.some((s) => s.start !== undefined)
                  ? ""
                  : "未校对"}
              </button>
            </div>
            {subtitles && (
              <div className="subtitle-text">
                {currentSegment
                  ? currentSegment.text
                  : "这段暂时没有已校对的逐字字幕，可以先跟声音。"}
                {currentSegment?.uncertain && (
                  <small>此句有疑字，请以原声为准。</small>
                )}
              </div>
            )}
          </section>
          <details className="loop-panel">
            <summary>
              练一个困难片段 <span>A–B 循环</span>
            </summary>
            <div className="loop-controls">
              <button
                className="pill"
                onClick={() => {
                  setA(position);
                  setLoop(false);
                }}
              >
                设起点 {a !== null && clockLabel(a)}
              </button>
              <button
                className="pill"
                onClick={() => {
                  setB(position);
                  setLoop(false);
                }}
              >
                设终点 {b !== null && clockLabel(b)}
              </button>
              <button
                className={`pill ${loop ? "selected" : ""}`}
                disabled={a === null || b === null || b - a < 0.5}
                onClick={() => {
                  if (!loop && player.current && a !== null)
                    player.current.currentTime = a;
                  setLoop(!loop);
                }}
              >
                {loop ? "关闭循环" : "开始循环"}
              </button>
              <label>
                间隔{" "}
                <select
                  aria-label="循环间隔"
                  value={gap}
                  onChange={(e) => setGap(Number(e.target.value))}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "无" : `${n} 秒`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="subtle">先连续跟读。需要时，再单独练这一小段。</p>
          </details>
        </>
      ) : (
        <>
          <article
            className={`reading-sheet font-${state.settings.font}`}
            style={{
              fontSize: state.settings.fontSize,
              lineHeight: state.settings.lineHeight,
            }}
          >
            {material.segments.map((s, index) => {
              const split = module === "bei" && [...s.text].length > 80;
              const units = split
                ? shortParts(s)
                : [
                    {
                      segmentId: s.id,
                      start: 0,
                      end: [...s.text].length,
                      text: s.text,
                    },
                  ];
              return (
                <section
                  key={s.id}
                  data-segment={s.id}
                  className={`passage ${index === position ? "current" : ""}`}
                >
                  <div className="passage-index">
                    {String(index + 1).padStart(2, "0")}
                    {s.uncertain && (
                      <span title="文本存在待核对内容"> · 待核对</span>
                    )}
                    {split && <span> · 按小句练，背准多少就确认多少</span>}
                  </div>
                  {units.map((unit, partIndex) => {
                    const checked = isCovered(masteredRanges, unit);
                    const current = index === position && unit.start === offset;
                    return (
                      <div
                        key={unit.start}
                        data-segment={s.id}
                        data-offset={unit.start}
                        className={`practice-part ${current ? "current-part" : ""}`}
                        onClick={() => {
                          beginInteraction();
                          goTo(index, unit.start);
                        }}
                      >
                        {split && (
                          <small className="part-label">
                            小句 {partIndex + 1}
                          </small>
                        )}
                        {review &&
                          target?.segmentId === s.id &&
                          target.start === unit.start && (
                            <small className="review-mark">
                              这句已经背准，先试着回忆
                            </small>
                          )}
                        <p
                          className={
                            module === "bei" &&
                            mode === "hidden" &&
                            !(peek && current)
                              ? "hidden-passage"
                              : ""
                          }
                        >
                          {module === "bei" &&
                          !(peek && current) &&
                          mode === "hidden"
                            ? split
                              ? "试着回忆这一小句。"
                              : "试着回忆这一段。"
                            : module === "bei" &&
                                !(peek && current) &&
                                mode === "hint"
                              ? hints(unit.text)
                              : unit.text}
                        </p>
                        <div className="passage-actions">
                          {module === "bei" ? (
                            <button
                              className={`mastery-button ${checked ? "is-mastered" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                beginInteraction();
                                goTo(index, unit.start);
                                toggleMastery(unit);
                              }}
                              aria-pressed={checked}
                            >
                              {checked
                                ? "✓ 已背准 · 可撤销"
                                : split
                                  ? "○ 确认这一小句背准"
                                  : "○ 确认这一段背准"}
                            </button>
                          ) : (
                            <button
                              className={`text-button ${current ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                beginInteraction();
                                goTo(index);
                              }}
                            >
                              {index === position
                                ? "下次从这里继续"
                                : "读到这里"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </article>
          <p className="source-note">来源：{material.source}</p>
        </>
      )}
      <dialog
        className="translation-drawer"
        ref={translationDialog}
        onCancel={() => setTranslation(false)}
        onClose={() => setTranslation(false)}
        aria-labelledby="translation-title"
      >
        <header>
          <div>
            <p className="eyebrow">
              {wholeTranslation
                ? "完整译文 · 未逐句对齐"
                : `第 ${position + 1} 段`}
            </p>
            <h2 id="translation-title">译文与注释</h2>
          </div>
          <button className="pill" onClick={() => setTranslation(false)}>
            返回原文
          </button>
        </header>
        {wholeTranslation && (
          <p className="subtle">
            这是整篇译文，供理解原文时参考。关闭后仍在刚才的原文位置。
          </p>
        )}
        <div className="translation-content">
          {translationSegment?.translation ? (
            <p>{translationSegment.translation}</p>
          ) : (
            <p className="subtle">这一段暂时没有译文。</p>
          )}
          {translationSegment?.note && (
            <p className="translation-note">{translationSegment.note}</p>
          )}
        </div>
      </dialog>
      <footer className="practice-footer" ref={footerRef}>
        <div className="session-bar">
          <span className="timer" aria-label="练习时长">
            {clockLabel(timer.seconds)} <small>/ 05:00</small>
          </span>
          <span
            className={`session-note ${timer.seconds >= 300 ? "reminder-due" : ""}`}
            role="status"
          >
            {timer.seconds >= 300
              ? "五分钟到了，把这一句说完就好。"
              : review
                ? timer.seconds - reviewStart >= state.settings.reviewSeconds
                  ? "回忆完这一句，再往下练"
                  : `复习已背准的小句 · ${Math.max(0, state.settings.reviewSeconds - Math.floor(timer.seconds - reviewStart))} 秒`
                : "每天一点，不必赶时间"}
          </span>
          {review && (
            <button className="text-button" onClick={endReview}>
              {timer.seconds - reviewStart >= state.settings.reviewSeconds
                ? "继续往下练"
                : "跳过复习"}
            </button>
          )}
          {module !== "gen" && (
            <button
              className="button small"
              onClick={() => {
                interacted.current = true;
                timer.running ? timer.pause() : timer.start();
              }}
            >
              {timer.running
                ? "暂停计时"
                : timer.seconds > 0
                  ? "继续计时"
                  : "开始练习"}
            </button>
          )}
        </div>
        {module === "gen" ? (
          <div className="dock-player">
            {" "}
            <div className="player-buttons">
              <button
                className="round-button"
                aria-label="后退十秒"
                onClick={() => {
                  if (player.current)
                    player.current.currentTime = Math.max(0, position - 10);
                }}
              >
                ↶<small>10</small>
              </button>
              <button
                className="play-button"
                disabled={!audioUrl}
                onClick={() => void togglePlay()}
                aria-label={playing ? "暂停播放" : "播放音频"}
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <button
                className="round-button"
                aria-label="前进十秒"
                onClick={() => {
                  if (player.current)
                    player.current.currentTime = Math.min(
                      duration,
                      position + 10,
                    );
                }}
              >
                ↷<small>10</small>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="reading-tools">
              {module === "bei" ? (
                <div className="segmented" aria-label="背诵提示方式">
                  {(["full", "hint", "hidden"] as const).map((m) => (
                    <button
                      key={m}
                      className={mode === m ? "active" : ""}
                      onClick={() => {
                        beginInteraction();
                        setMode(m);
                        setPeek(false);
                      }}
                    >
                      {m === "full" ? "全文" : m === "hint" ? "提示" : "隐藏"}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="subtle">
                  {position + 1} / {material.segments.length} 段
                </span>
              )}
              <button
                className={`pill ${translation ? "selected" : ""}`}
                onClick={() => setTranslation(!translation)}
              >
                {translation ? "收起译文" : "译文与注释"}
              </button>
              {module === "bei" && mode !== "full" && (
                <button
                  className="peek-button"
                  onClick={() => {
                    beginInteraction();
                    setPeek(!peek);
                  }}
                >
                  {peek ? "继续回忆" : "看原文核对"}
                </button>
              )}
            </div>
          </>
        )}
        <div className="finish-row">
          <div>
            <strong>
              {module === "bei"
                ? `已背准 ${masteryLabel({ ...progress, masteredRanges, mastered: material.segments.filter((s) => s.text && isCovered(masteredRanges, { segmentId: s.id, start: 0, end: [...s.text].length })).map((s) => s.id) }, material)}`
                : "今天的练习"}
            </strong>
            <small>
              {module === "bei" ? "只确认一字不差的部分" : "随时可以收尾"}
            </small>
          </div>
          <button className="button primary" onClick={() => finish(true)}>
            今天练到这里 <span>✓</span>
          </button>
        </div>
      </footer>
    </main>
  );
}
