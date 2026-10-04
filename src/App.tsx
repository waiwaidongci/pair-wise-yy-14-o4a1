import { useMemo, useState } from "react";
import { useEngine, failGroup } from "./engine/store";
import { CanonicalEntry, MemberType } from "./engine/types";
import { BatchPanel, ConflictCard, ResultBanner } from "./components/panels";
import { ComponentsView, DefectsView, DimensionsView, RelationsView } from "./components/views";
import "./styles.css";

type Tab = "batch" | "components" | "dimensions" | "defects" | "relations";

const TABS: { key: Tab; label: string }[] = [
  { key: "batch", label: "批次与归档" },
  { key: "components", label: "构件清单" },
  { key: "dimensions", label: "尺寸台账" },
  { key: "defects", label: "病害落点图" },
  { key: "relations", label: "建筑关系" },
];

function App() {
  const { state, lastResult, actions } = useEngine();
  const [tab, setTab] = useState<Tab>("batch");

  const conflicts = useMemo(() => {
    const out: { type: MemberType; entry: CanonicalEntry<any> }[] = [];
    (["component", "dimension", "defect", "relation"] as const).forEach((type) => {
      const key = (type + "s") as "components" | "dimensions" | "defects" | "relations";
      Object.values(state[key]).forEach((e) => {
        if (e.status === "conflict") out.push({ type, entry: e });
      });
    });
    return out;
  }, [state]);

  const partial = Object.values(state.batches).find((b) => b.status === "partial");
  const metrics = [
    { label: "现行构件", value: Object.values(state.components).filter((e) => e.status === "active").length },
    { label: "待确认双份", value: conflicts.length },
    { label: "失效待重算", value: Object.values(state.relations).filter((e) => e.status === "invalid").length },
    { label: "已归档草稿组", value: state.archives.length },
  ];

  return (
    <main className="app">
      <section className="hero compact">
        <p>木结构榫卯构件测绘 · 离线多队批次合并内核</p>
        <h1>正殿测绘同步工作台</h1>
        <span>
          四队分头进殿、断网各记一份；回站后把构件清单、尺寸台账、病害落点图、建筑关系挂到同一测绘批次合并。
          同一记录双方都改 → 两份保留待确认；换件 → 关系边与修缮结论级联失效重算；落盘失败从最后确认的构件续传；
          重传同一批次只认第一次；无批次号草稿按测量日期归档。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel control">
        <h2>到站操作（按顺序点一遍即可看到完整链路）</h2>
        <div className="btn-row wrap">
          <button className="primary" onClick={actions.receiveTeamA}>① 甲队先到，合并 BATCH-20261004-A</button>
          <button onClick={actions.armFailure.bind(null, "L03")} title="预置一次存储掉电">
            预置 L03 组落盘掉电 {failGroup() === "L03" ? "（已布防）" : ""}
          </button>
          <button onClick={actions.receiveTeamB}>② 乙队晚到（同一批次）</button>
          <button onClick={actions.retryTeamA} disabled={!state.batches["BATCH-20261004-A"]}>③ 甲队重传（内容不同，应被忽略）</button>
          {partial && <button className="primary" onClick={actions.receiveTeamA}>④ 修复存储后续传甲队</button>}
          {partial && <button onClick={actions.repairStorage}>标记存储已修复</button>}
          <button onClick={actions.archiveLegacy}>收一份无批次号老草稿</button>
          <button className="ghost" onClick={actions.reset}>↺ 全部重置</button>
        </div>
        <ResultBanner r={lastResult} />
        <p className="note">
          演示脚本：甲队先到 → 三穿梁 L02、随梁枋 L03 均为更换件（关系边 R-02/R-03 失效、F-05 修缮结论重算）；
          若已预置掉电，甲队在 L03 组保存失败，L02 及之前已确认、检查点停住；乙队晚到后与站上在 L02/F-01/R-01 上各有改动 → 三份冲突双留；
          续传完成后逐张裁决，全部清零再整体确认批次。
        </p>
      </section>

      {conflicts.length > 0 && (
        <section className="panel">
          <h2>待确认异本（{conflicts.length}）— 晚到记录从未覆盖站上数据</h2>
          <div className="stack">
            {conflicts.map(({ type, entry }) => (
              <ConflictCard
                key={type + entry.id}
                type={type}
                entry={entry}
                onResolve={(by, choice) =>
                  actions.resolve(type, entry.id, by === "__station__" ? entry.candidates[0].by : by, choice)
                }
              />
            ))}
          </div>
        </section>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="panel">
        {tab === "batch" && <BatchPanel state={state} onConfirm={actions.confirm} />}
        {tab === "components" && <ComponentsView state={state} />}
        {tab === "dimensions" && <DimensionsView state={state} />}
        {tab === "defects" && <DefectsView state={state} />}
        {tab === "relations" && <RelationsView state={state} onRecompute={actions.recompute} />}
      </section>

      <section className="panel">
        <h2>合并日志</h2>
        <ol className="log">
          {[...state.log].reverse().slice(0, 14).map((l) => (
            <li key={l.at + l.text} className={l.level}>
              <time>{l.at.slice(11, 19)}</time>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export default App;
