import { useEffect, useRef, useState } from "react";
import { publishMaterial, synchronize } from "./api";
import {
  dayKey,
  mergeEvents,
  progressFor,
  masteryLabel,
  type Module,
  type PracticeEvent,
} from "./domain";
import { eventSchema, materialSchema, type Material } from "./schema";
import {
  addEvent,
  loadAudio,
  materialKey,
  mergeMaterials,
  readState,
  saveState,
  storeAudio,
  type State,
  type Settings,
} from "./storage";
import { localAudio, seeds } from "./seeds";
import { Practice } from "./Practice";
const info = {
  gen: {
    name: "跟",
    time: "早晨",
    description: "跟住节奏，让话顺起来。",
    verb: "开始跟读",
    icon: "〰",
  },
  bei: {
    name: "背",
    time: "白天",
    description: "少背一点，把这一点背准。",
    verb: "开始背诵",
    icon: "﹏",
  },
  song: {
    name: "诵",
    time: "睡前",
    description: "出声读一段，让心静下来。",
    verb: "开始诵读",
    icon: "☾",
  },
};
const modules: Module[] = ["gen", "bei", "song"];
function Sprig() {
  return (
    <svg className="sprig" viewBox="0 0 180 200" fill="none" aria-hidden="true">
      <path
        d="M82 190C80 146 95 70 124 24"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M96 117C61 123 39 106 35 82C61 74 84 84 96 117ZM107 91C145 93 163 77 164 53C134 51 117 69 107 91ZM85 155C58 157 41 145 37 124C58 121 77 133 85 155ZM117 59C94 56 81 39 87 18C109 25 118 38 117 59Z"
        fill="currentColor"
        opacity=".16"
      />
      <path
        d="M96 117L45 90M107 91L155 62M85 155L44 131M117 59L92 26"
        stroke="currentColor"
        opacity=".55"
      />
    </svg>
  );
}
export default function App() {
  const [state, setState] = useState(readState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [tab, setTab] = useState<"today" | "library" | "history">("today");
  const [practice, setPractice] = useState<{
    module: Module;
    material: Material;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const materials = mergeMaterials(
    seeds,
    import.meta.env.DEV ? [localAudio] : [],
    state.materials,
  );
  const update = (fn: (s: State) => State) => {
    const next = fn(stateRef.current);
    try {
      saveState(next);
      stateRef.current = next;
      setState(next);
      return true;
    } catch {
      setNotice("设备存储空间不足，暂时无法保存。请先导出记录。");
      return false;
    }
  };
  const sync = async () => {
    if (syncingRef.current || !stateRef.current.settings.apiUrl) return;
    if (
      !stateRef.current.settings.apiUrl.startsWith("/") &&
      !stateRef.current.settings.token
    )
      return;
    syncingRef.current = true;
    setSyncing(true);
    const snapshot = stateRef.current;
    try {
      const remote = await synchronize(snapshot);
      update((current) => ({
        ...current,
        events: mergeEvents(current.events, remote.events),
        materials: mergeMaterials(current.materials, remote.materials),
        pending: [
          ...new Set([
            ...remote.pending,
            ...current.pending.filter((id) => !snapshot.pending.includes(id)),
          ]),
        ],
        lastSync: remote.lastSync,
        waitingMaterials: remote.waitingMaterials,
      }));
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);
  useEffect(() => {
    void sync();
    const interval = setInterval(() => void sync(), 30000);
    const online = () => void sync();
    window.addEventListener("online", online);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", online);
    };
  }, []);
  useEffect(() => {
    const change = (e: StorageEvent) => {
      if (e.key === "gbs-v1") {
        const incoming = readState();
        const current = stateRef.current;
        const next = {
          ...incoming,
          events: mergeEvents(current.events, incoming.events),
          materials: mergeMaterials(current.materials, incoming.materials),
          pending: [
            ...new Set([
              ...incoming.pending,
              ...current.pending.filter(
                (id) => !incoming.events.some((e) => e.id === id),
              ),
            ]),
          ].sort(),
        };
        // A storage notification must not write back and trigger a tab-to-tab loop.
        stateRef.current = next;
        setState(next);
      }
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, []);
  const choose = (module: Module) => {
    const key = state.selected[module];
    const latest = mergeEvents(state.events)
      .filter((e) => e.module === module)
      .at(-1);
    return (
      materials.find(
        (m) => materialKey(m) === key && m.modules.includes(module),
      ) ??
      materials.find(
        (m) =>
          m.id === latest?.materialId &&
          m.version === latest.version &&
          m.modules.includes(module),
      ) ??
      materials.find((m) => m.modules.includes(module))
    );
  };
  const openPractice = (module: Module, material: Material) => {
    setPractice({ module, material });
  };
  const start = (module: Module) => {
    const m = choose(module);
    if (m) openPractice(module, m);
    else {
      setTab("library");
      setNotice("先准备一段你喜欢的音频，确认后导入。");
    }
  };
  const record = (e: PracticeEvent) => {
    const ok = update((s) => ({
      ...addEvent(s, e),
      selected: { ...s.selected, [e.module]: `${e.materialId}@${e.version}` },
    }));
    if (ok) queueMicrotask(() => void sync());
    return ok;
  };
  const setSettings = (settings: Settings) =>
    update((s) => ({ ...s, settings }));
  const today = dayKey();
  const todayEvents = state.events.filter(
    (e) => e.day === today && e.kind === "practice",
  );
  const todayMinutes = Math.round(
    todayEvents.reduce((n, e) => n + e.seconds, 0) / 60,
  );
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <div className={`app-shell ${practice ? "in-practice" : ""}`}>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            if (!practice) setTab("today");
          }}
          aria-label="跟背诵首页"
        >
          <span className="brand-mark">习</span>
          <span>
            跟背诵<small>每天一点</small>
          </span>
        </button>
        <div className="header-right">
          <button
            className="sync-indicator"
            onClick={() => {
              if (
                !state.settings.apiUrl ||
                (!state.settings.apiUrl.startsWith("/") &&
                  !state.settings.token)
              )
                setSettingsOpen(true);
              else {
                if (state.waitingMaterials.length) setTab("library");
                void sync();
              }
            }}
            title={
              state.lastSync
                ? `最近同步 ${new Date(state.lastSync).toLocaleString()}`
                : "记录保存在此设备"
            }
          >
            <span
              className={state.pending.length ? "pending-dot" : "status-dot"}
            />
            {syncing
              ? "同步中…"
              : state.settings.apiUrl &&
                  !state.settings.apiUrl.startsWith("/") &&
                  !state.settings.token
                ? "连接同步"
                : state.pending.length
                  ? `${state.pending.length} 条待同步`
                  : state.lastSync
                    ? "已同步"
                    : "此设备保存"}
          </button>
          <button
            className="icon-button"
            aria-label="打开设置"
            onClick={() => setSettingsOpen(true)}
          >
            ☷
          </button>
        </div>
      </header>
      {notice && (
        <div className="global-notice" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {practice ? (
        <Practice
          key={`${practice.module}:${materialKey(practice.material)}`}
          {...practice}
          state={state}
          save={record}
          onClose={() => setPractice(null)}
          changeSpeed={(speed) =>
            setSettings({ ...stateRef.current.settings, speed })
          }
        />
      ) : (
        <>
          <main
            className={`main-content ${tab === "today" ? "today-content" : ""}`}
          >
            {tab === "today" ? (
              <>
                <section className="hero">
                  <div>
                    <p className="eyebrow">{date} · 日常练习</p>
                    <h1>
                      每天一点，
                      <br />
                      慢慢成章<span>。</span>
                    </h1>
                    <p>
                      跟着说，认真背，出声读。
                      <br className="mobile-break" />
                      把五分钟留给自己。
                    </p>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="sun-disc" />
                    <Sprig />
                    <span>日有所习</span>
                  </div>
                </section>
                <div className="section-heading">
                  <h2>今天，从这里继续</h2>
                  <span>
                    {todayEvents.length
                      ? `已练 ${todayMinutes < 1 ? "不到 1" : todayMinutes} 分钟`
                      : "不必赶，开始就好"}
                  </span>
                </div>
                <section className="practice-cards">
                  {modules.map((module) => {
                    const m = choose(module);
                    const p = m
                      ? progressFor(state.events, module, m.id, m.version, m)
                      : null;
                    const done = todayEvents.some(
                      (e) => e.module === module && e.completed,
                    );
                    return (
                      <article
                        key={module}
                        className={`practice-card ${module}`}
                      >
                        <div className="card-top">
                          <span>
                            {info[module].time} <i>·</i> 五分钟
                          </span>
                          {done ? (
                            <span className="today-done">✓ 今天练过</span>
                          ) : (
                            <span>{info[module].icon}</span>
                          )}
                        </div>
                        <div className="card-character">
                          {info[module].name}
                        </div>
                        <p className="card-description">
                          {info[module].description}
                        </p>
                        <div className="card-material">
                          <small title={m?.author}>
                            {m?.author ?? "准备你的材料"}
                          </small>
                          <h3 title={m?.title}>
                            {m?.title ?? "选一段喜欢的声音"}
                          </h3>
                          <p>
                            {m
                              ? p?.last
                                ? `接着上次 · ${module === "gen" ? `${Math.floor(p.position / 60)} 分 ${Math.floor(p.position % 60)} 秒` : module === "bei" ? `已背准 ${masteryLabel(p, m!)}` : `第 ${Math.floor(p.position) + 1} 段`}`
                                : "从第一段开始"
                              : "导入音频，之后就能接着练"}
                          </p>
                        </div>
                        <button
                          className="card-start"
                          onClick={() => start(module)}
                        >
                          {p?.last ? "继续练习" : info[module].verb}
                          <span>↗</span>
                        </button>
                      </article>
                    );
                  })}
                </section>
                <section className="gentle-note">
                  <span>小记</span>
                  <p>
                    背得少也没关系。
                    <br />
                    一字不差的这一句，就是今天的积累。
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("history")}
                  >
                    看看积累 →
                  </button>
                </section>
              </>
            ) : tab === "library" ? (
              <Library
                materials={materials}
                state={state}
                update={update}
                notify={setNotice}
                onPractice={openPractice}
              />
            ) : (
              <History state={state} materials={materials} />
            )}
          </main>
          <nav className="bottom-nav" aria-label="主导航">
            {(
              [
                { id: "today", name: "今日", icon: "◌" },
                { id: "library", name: "材料", icon: "▤" },
                { id: "history", name: "记录", icon: "◷" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                <span>{t.icon}</span>
                {t.name}
              </button>
            ))}
          </nav>
        </>
      )}
      {settingsOpen && (
        <SettingsDialog
          state={state}
          onClose={() => setSettingsOpen(false)}
          onSave={setSettings}
          onSync={() => void sync()}
          update={update}
          notify={setNotice}
        />
      )}
    </div>
  );
}
function Library({
  materials,
  state,
  update,
  notify,
  onPractice,
}: {
  materials: Material[];
  state: State;
  update: (f: (s: State) => State) => boolean;
  notify: (s: string) => void;
  onPractice: (module: Module, m: Material) => void;
}) {
  const [candidate, setCandidate] = useState<Material | null>(null),
    [audio, setAudio] = useState<File | null>(null),
    [upload, setUpload] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const open = async (file: File) => {
    try {
      const parsed = materialSchema.parse(JSON.parse(await file.text()));
      setCandidate(parsed);
      setAudio(null);
      setUpload(false);
      setError("");
    } catch {
      setError(
        "这份文件还不是可用的材料包，请让 AI 按项目中的材料格式整理后再导入。",
      );
    }
  };
  const confirm = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      if (audio && audio.size > 50 * 1024 * 1024)
        throw new Error("请先把音频裁成练习片段（上限 50 MB）。");
      const m = audio ? { ...candidate, audioFile: audio.name } : candidate;
      const existing = materials.find((x) => materialKey(x) === materialKey(m));
      if (existing && JSON.stringify(existing) !== JSON.stringify(m))
        throw new Error("这个材料版本已存在不同内容，请增加版本号。");
      if (audio) await storeAudio(materialKey(m), audio);
      const published = upload
        ? await publishMaterial(
            state.settings,
            m,
            audio ?? (await loadAudio(materialKey(m))),
          )
        : null;
      if (
        !update((s) => ({
          ...s,
          materials: mergeMaterials(s.materials, [m]),
          selected: {
            ...s.selected,
            ...Object.fromEntries(
              m.modules.map((module) => [module, materialKey(m)]),
            ),
          },
        }))
      )
        return;
      setCandidate(null);
      setAudio(null);
      notify(
        upload
          ? published?.audioPending
            ? "材料已导入，文字和进度可同步。音频保存在此设备，云端音频存储尚未开通。"
            : "材料已导入并同步。"
          : "材料已导入此设备。需要跨设备使用时，可在材料卡片上同步。",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const syncMaterial = async (m: Material) => {
    if (!window.confirm(`将“${m.title}”及所附音频上传到你配置的同步服务？`))
      return;
    try {
      const published = await publishMaterial(
        state.settings,
        m,
        await loadAudio(materialKey(m)),
      );
      notify(
        published.audioPending
          ? "文字和练习进度可同步；音频仍保存在此设备，云端音频存储尚未开通。"
          : "材料已同步。",
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">留给下一次练习</p>
          <h1>你的材料</h1>
          <p className="subtle">你来选内容，AI 帮你整理。确认后，再放进来。</p>
        </div>
        <button
          className="button primary"
          onClick={() => fileRef.current?.click()}
        >
          ＋ 导入材料包
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void open(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && !candidate && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="library-list">
        {materials.map((m) => (
          <article className="library-card" key={materialKey(m)}>
            <div className="library-card-top">
              <span className="eyebrow">{m.author}</span>
              <span className="material-badge">
                {m.visibility === "private" ? "私人材料" : "可分享原文"} · v
                {m.version}
              </span>
            </div>
            <h2>{m.title}</h2>
            <p>
              {m.segments.length} 段 · {m.audioFile ? "有音频" : "文字材料"}
            </p>
            <p className="source-note">{m.source}</p>
            {state.waitingMaterials.includes(materialKey(m)) && (
              <p className="source-note">
                这份材料的练习记录保存在此设备。先同步材料，其他设备和 Agent
                才能看到这些记录。
              </p>
            )}
            <div className="library-actions">
              {m.modules.map((module) => (
                <div key={module}>
                  <button
                    className="pill"
                    onClick={() => onPractice(module, m)}
                  >
                    {info[module].name} · 练习
                  </button>
                  <button
                    className={`text-button ${state.selected[module] === materialKey(m) ? "active" : ""}`}
                    onClick={() => {
                      update((s) => ({
                        ...s,
                        selected: { ...s.selected, [module]: materialKey(m) },
                      }));
                      notify(`已设为“${info[module].name}”的当前材料。`);
                    }}
                  >
                    {state.selected[module] === materialKey(m)
                      ? "✓ 当前材料"
                      : "设为当前"}
                  </button>
                </div>
              ))}
              {state.materials.some(
                (x) => materialKey(x) === materialKey(m),
              ) && (
                <button
                  className="text-button"
                  onClick={() => void syncMaterial(m)}
                >
                  同步此材料
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="preparation-note">
        <h3>让 AI 准备一份材料包</h3>
        <p>
          提供音频、视频链接或原文，请它按本项目的材料格式整理成
          JSON。有音频时，导入前再附上音频文件。
        </p>
        <p>逐字字幕要与原声吻合；疑字保留标记。没有字幕也可以先跟声音。</p>
        <a href={`${import.meta.env.BASE_URL}material-example.json`} download>
          下载材料包示例 ↓
        </a>
      </div>
      {candidate && (
        <div className="modal-backdrop">
          <section
            className="dialog import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="dialog-heading">
              <h2 id="import-title">先看一眼材料</h2>
              <button
                className="icon-button"
                aria-label="关闭导入"
                onClick={() => setCandidate(null)}
              >
                ×
              </button>
            </div>
            <p className="eyebrow">{candidate.author}</p>
            <h3>{candidate.title}</h3>
            <p className="source-note">{candidate.source}</p>
            <div className="import-preview">
              {candidate.segments.map((s) => (
                <div key={s.id}>
                  <p>{s.text || "（仅音频）"}</p>
                  {s.translation && <small>{s.translation}</small>}
                  {s.uncertain && <span className="uncertain">待核对</span>}
                </div>
              ))}
            </div>
            {candidate.modules.includes("gen") && (
              <label className="file-label">
                附上音频（MP3 / M4A，最多 50 MB）
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a"
                  onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={upload}
                disabled={!state.settings.apiUrl}
                onChange={(e) => setUpload(e.target.checked)}
              />
              同时上传到我的同步服务
              {!state.settings.apiUrl && "（先在设置中连接）"}
            </label>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy
                ? "正在导入…"
                : upload
                  ? "确认导入并同步"
                  : "确认导入此设备"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function History({
  state,
  materials,
}: {
  state: State;
  materials: Material[];
}) {
  const practices = [...state.events]
    .filter((e) => e.kind === "practice")
    .reverse();
  const total = practices.reduce((n, e) => n + e.seconds, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      key: dayKey(d),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      seconds: practices
        .filter((e) => e.day === dayKey(d))
        .reduce((n, e) => n + e.seconds, 0),
    };
  });
  const max = Math.max(900, ...days.map((d) => d.seconds));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">走过的每一点，都在这里</p>
          <h1>练习小记</h1>
        </div>
      </div>
      <section className="history-summary">
        <div>
          <span>累计练习</span>
          <strong>
            {Math.floor(total / 60)}
            <small>分钟</small>
          </strong>
        </div>
        <div>
          <span>练习次数</span>
          <strong>
            {practices.length}
            <small>次</small>
          </strong>
        </div>
        <div>
          <span>最近同步</span>
          <p>
            {state.lastSync
              ? new Date(state.lastSync).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "保存在此设备"}
          </p>
        </div>
      </section>
      <section className="week-chart" aria-label="最近七天练习时长">
        {days.map((d) => (
          <div key={d.key}>
            <span>
              {d.seconds ? `${Math.round(d.seconds / 60)} 分钟` : "—"}
            </span>
            <div className="chart-track">
              <div
                style={{ height: `${Math.max(3, (d.seconds / max) * 100)}%` }}
              />
            </div>
            <small>{d.label}</small>
          </div>
        ))}
      </section>
      <div className="section-heading">
        <h2>最近练习</h2>
        <span>完成练习和背准内容，分别记录</span>
      </div>
      {practices.length ? (
        <div className="history-list">
          {practices.map((e) => (
            <article key={e.id}>
              <span className={`history-module ${e.module}`}>
                {info[e.module].name}
              </span>
              <div>
                <h3>
                  {materials.find(
                    (m) => m.id === e.materialId && m.version === e.version,
                  )?.title ?? e.materialId}
                </h3>
                <p>
                  {e.day} · {Math.floor(e.seconds / 60)} 分 {e.seconds % 60} 秒
                  {e.confirmed.length
                    ? ` · 新确认 ${e.confirmed.length} 段`
                    : ""}
                  {e.confirmedRanges?.length
                    ? ` · 新确认 ${e.confirmedRanges.length} 处小句`
                    : ""}
                </p>
              </div>
              <span className="subtle">
                {e.completed ? "练到这里" : "中途保存"}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>◷</span>
          <p>
            从今天的一小段开始。
            <br />
            每次练习都会留在这里。
          </p>
        </div>
      )}
    </>
  );
}
function SettingsDialog({
  state,
  onClose,
  onSave,
  onSync,
  update,
  notify,
}: {
  state: State;
  onClose: () => void;
  onSave: (s: Settings) => boolean;
  onSync: () => void;
  update: (f: (s: State) => State) => boolean;
  notify: (s: string) => void;
}) {
  const [draft, setDraft] = useState(state.settings),
    [pane, setPane] = useState<"comfort" | "sync">(
      state.settings.apiUrl &&
        !state.settings.apiUrl.startsWith("/") &&
        !state.settings.token
        ? "sync"
        : "comfort",
    ),
    [error, setError] = useState("");
  const backupRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const save = () => {
    try {
      if (draft.apiUrl && !draft.apiUrl.startsWith("/")) {
        const url = new URL(draft.apiUrl);
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          )
        )
          throw new Error("线上同步地址需要 HTTPS。");
      }
      if (onSave(draft)) {
        onClose();
        onSync();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...state, settings: { ...state.settings, token: "" } },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `跟背诵记录-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const events = (data.events ?? []).map((e: unknown) =>
        eventSchema.parse(e),
      );
      const materials = (data.materials ?? []).map((m: unknown) =>
        materialSchema.parse(m),
      );
      if (
        update((s) => ({
          ...s,
          events: mergeEvents(s.events, events),
          pending: [
            ...new Set([
              ...s.pending,
              ...events.map((e: PracticeEvent) => e.id),
            ]),
          ],
          materials: mergeMaterials(s.materials, materials),
        }))
      )
        notify("记录已合并恢复。音频文件需单独导入。");
    } catch {
      setError("无法恢复这份备份，请检查文件格式。");
    }
  };
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="dialog-heading">
          <h2 id="settings-title">用得舒服一点</h2>
          <button
            className="icon-button"
            aria-label="关闭设置"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="segmented">
          <button
            className={pane === "comfort" ? "active" : ""}
            onClick={() => setPane("comfort")}
          >
            阅读与练习
          </button>
          <button
            className={pane === "sync" ? "active" : ""}
            onClick={() => setPane("sync")}
          >
            同步与备份
          </button>
        </div>
        {pane === "comfort" ? (
          <div className="settings-fields">
            <label>
              主题
              <select
                value={draft.theme}
                onChange={(e) =>
                  set("theme", e.target.value as Settings["theme"])
                }
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色纸页</option>
                <option value="dark">深色夜读</option>
              </select>
            </label>
            <label>
              字体
              <select
                value={draft.font}
                onChange={(e) =>
                  set("font", e.target.value as Settings["font"])
                }
              >
                <option value="serif">宋体 · 慢读</option>
                <option value="sans">黑体 · 清晰</option>
              </select>
            </label>
            <label>
              字号 <span>{draft.fontSize}px</span>
              <input
                aria-label="字号"
                type="range"
                min="18"
                max="36"
                value={draft.fontSize}
                onChange={(e) => set("fontSize", Number(e.target.value))}
              />
            </label>
            <label>
              行距 <span>{draft.lineHeight.toFixed(1)}</span>
              <input
                aria-label="行距"
                type="range"
                min="1.5"
                max="2.8"
                step="0.1"
                value={draft.lineHeight}
                onChange={(e) => set("lineHeight", Number(e.target.value))}
              />
            </label>
            <label>
              先复习多久
              <select
                value={draft.reviewSeconds}
                onChange={(e) => set("reviewSeconds", Number(e.target.value))}
              >
                {[0, 30, 60, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "直接练新段" : `${n} 秒`}
                  </option>
                ))}
              </select>
            </label>
            <p
              className="reading-sample"
              style={{
                fontSize: draft.fontSize,
                lineHeight: draft.lineHeight,
                fontFamily:
                  draft.font === "serif" ? "var(--serif)" : "var(--sans)",
              }}
            >
              求业之精，别无他法，曰专而已矣。
            </p>
          </div>
        ) : (
          <div className="settings-fields">
            <p className="subtle">
              连接后，手机和电脑就能接着练。还没有连接时，记录保存在此设备。
            </p>
            <label>
              同步服务地址
              <input
                placeholder="https://你的服务地址/api"
                value={draft.apiUrl}
                onChange={(e) => set("apiUrl", e.target.value.trim())}
              />
            </label>
            <label>
              我的连接密钥
              <input
                type="password"
                autoComplete="off"
                value={draft.token}
                onChange={(e) => set("token", e.target.value.trim())}
              />
            </label>
            <p className="subtle">
              Agent 使用另一枚只读密钥。密钥不随备份导出。
            </p>
            <div className="backup-actions">
              <button className="pill" onClick={exportData}>
                导出练习记录
              </button>
              <button
                className="pill"
                onClick={() => backupRef.current?.click()}
              >
                恢复记录
              </button>
              <input
                hidden
                type="file"
                accept=".json"
                ref={backupRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void restore(f);
                }}
              />
            </div>
            <small>备份含文字材料与记录，不含音频。</small>
          </div>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full-width" onClick={save}>
          保存设置
        </button>
      </section>
    </div>
  );
}
