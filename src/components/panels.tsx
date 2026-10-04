import { useState } from "react";
import { ArrivalResult, CanonicalEntry, HistoryEntry, MemberType, State } from "../engine/types";

export function Badge({ status }: { status: CanonicalEntry<any>["status"] }) {
  const map = {
    active: { t: "现行", cls: "ok" },
    conflict: { t: "双份待确认", cls: "warn" },
    invalid: { t: "已失效·待重算", cls: "err" },
  } as const;
  const m = map[status];
  return <span className={`badge ${m.cls}`}>{m.t}</span>;
}

export function History<T>({ entry }: { entry: CanonicalEntry<T> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="history">
      <button className="link" onClick={() => setOpen((v) => !v)}>
        {open ? "收起版本" : `旧成果可查（${entry.history.length} 个历史版本）`}
      </button>
      {open && (
        <ol className="timeline">
          {entry.history.map((h: HistoryEntry<T>, i) => (
            <li key={i}>
              <div className="tl-head">
                <b>r{h.rev}</b>
                <span>{h.by} · {h.at}</span>
              </div>
              <p>{h.reason}</p>
              <pre>{JSON.stringify(h.data, null, 1)}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<MemberType, string> = {
  component: "构件",
  dimension: "尺寸",
  defect: "病害",
  relation: "关系边",
};

export function ConflictCard<T extends { id: string }>({
  entry,
  type,
  onResolve,
}: {
  entry: CanonicalEntry<T>;
  type: MemberType;
  onResolve: (by: string, choice: "keep-station" | "take-late") => void;
}) {
  return (
    <article className="conflict-card">
      <header>
        <span className="badge warn">{TYPE_LABEL[type]} {entry.id}</span>
        <span>双方都改自旧基线，两份并存，任何一边都未覆盖另一边</span>
      </header>
      <div className="conflict-grid">
        <div className="variant station">
          <h4>站上现行版本 <small>r{entry.rev} · {entry.updatedBy}</small></h4>
          <pre>{JSON.stringify(entry.data, null, 1)}</pre>
          <button className="primary" onClick={() => onResolve("__station__", "keep-station")}>
            确认保留站上版本
          </button>
        </div>
        {entry.candidates.map((c) => (
          <div className="variant late" key={c.by}>
            <h4>{c.by} 晚到版本 <small>基于 r{c.baseRev} · {c.at.slice(0, 16)}</small></h4>
            <pre>{JSON.stringify(c.data, null, 1)}</pre>
            <button onClick={() => onResolve(c.by, "take-late")}>确认采用晚到版本</button>
          </div>
        ))}
      </div>
      <History entry={entry} />
    </article>
  );
}

export function ResultBanner({ r }: { r: ArrivalResult | null }) {
  if (!r) return null;
  const cls = r.status === "partial" ? "err" : r.status === "duplicate" ? "info" : r.conflicts.length ? "warn" : "ok";
  return (
    <div className={`banner ${cls}`}>
      <div>
        <b>
          {r.team} · {r.status === "applied" ? "到站合并完成" : r.status === "partial" ? "部分落盘（断点可续传）" : r.status === "duplicate" ? "重传已幂等忽略" : "已归档"}
        </b>
        <p>{r.message}</p>
      </div>
      <ul className="result-stats">
        <li>接受 <b>{r.applied.length}</b></li>
        <li>冲突双留 <b>{r.conflicts.length}</b></li>
        <li>级联失效 <b>{r.invalidated.length}</b></li>
        <li>结论重算 <b>{r.recomputed.length}</b></li>
        <li>检查点 <b>{r.checkpointAfter ?? "—"}</b></li>
      </ul>
    </div>
  );
}

export function BatchPanel({ state, onConfirm }: { state: State; onConfirm: (id: string) => void }) {
  const batches = Object.values(state.batches);
  return (
    <div className="stack">
      {batches.length === 0 && <p className="muted">尚无批次到站。使用上方按钮模拟甲队（先到）、乙队（晚到）。</p>}
      {batches.map((b) => (
        <article className="panel-card" key={b.batchId}>
          <div className="row-between">
            <h3>{b.batchId} <small>{b.building}</small></h3>
            <span className={`badge ${b.status === "confirmed" ? "ok" : b.status === "partial" ? "err" : b.status === "received" ? "warn" : "info"}`}>
              {b.status === "open" ? "进行中" : b.status === "partial" ? "部分落盘" : b.status === "received" ? "已收齐·待清零冲突" : "已确认封存"}
            </span>
          </div>
          <p className="muted">四类成果（构件清单 / 尺寸台账 / 病害落点 / 建筑关系）均挂在本批次号下合并</p>
          <table className="mini">
            <thead>
              <tr><th>测绘队</th><th>状态</th><th>接受/冲突/失效/重算</th><th>最后确认构件（断点）</th><th>载荷校验</th></tr>
            </thead>
            <tbody>
              {Object.values(b.arrivals).map((a) => (
                <tr key={a.team + a.at}>
                  <td>{a.team}</td>
                  <td>{a.status}</td>
                  <td>{a.applied.length}/{a.conflicts.length}/{a.invalidated.length}/{a.recomputed.length}</td>
                  <td>{a.checkpointAfter ?? "—"}</td>
                  <td><code>{a.payloadHash}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          {Object.values(b.partials).map((p) => (
            <p className="note err" key={p.payload.team}>
              {p.payload.team} 存在未落盘的首次载荷（检查点 {p.afterComponentId ?? "起点"}，已确认 {p.appliedMembers.length} 个成员）；
              存储修复后由该队"续传"从断点继续，重传内容不会被采纳。其他队到站互不影响。
            </p>
          ))}
          <div className="btn-row">
            <button className="primary" disabled={b.status !== "received"} onClick={() => onConfirm(b.batchId)}>
              冲突清零后整体确认批次
            </button>
          </div>
        </article>
      ))}

      <article className="panel-card">
        <h3>无批次号草稿归档</h3>
        {state.archives.length === 0 ? (
          <p className="muted">老草稿入站后按测量日期分组归档，只可查、绝不并入主数据。</p>
        ) : (
          <div className="archive-grid">
            {state.archives.map((g) => (
              <div className="archive-group" key={g.date}>
                <h4>测量日期 {g.date}</h4>
                {g.drafts.map((d, i) => (
                  <p key={i} className="muted">{d.team} · 构件 {d.payload.components.map((c) => c.data.id).join("、")} · {d.archivedAt.slice(0, 16)} 归档</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
