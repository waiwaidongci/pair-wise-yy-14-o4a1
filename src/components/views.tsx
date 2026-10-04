import { CanonicalEntry, ComponentRec, DefectRec, DimensionRec, RelationRec, State } from "../engine/types";
import { Badge, History } from "./panels";

export function ComponentsView({ state }: { state: State }) {
  const list = Object.values(state.components).sort((a, b) => (a.id < b.id ? -1 : 1));
  return (
    <div className="card-table">
      <table>
        <thead>
          <tr>
            <th>构件编号</th><th>名称</th><th>木材</th><th>榫卯</th><th>截面</th><th>状态</th><th>备注 / 来源</th><th>版本</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e: CanonicalEntry<ComponentRec>) => (
            <tr key={e.id} className={e.status === "conflict" ? "row-conflict" : e.data.replaced ? "row-replaced" : ""}>
              <td><b>{e.id}</b>{e.data.replaced && <span className="tag">更换件</span>}</td>
              <td>{e.data.name}</td>
              <td>{e.data.wood}</td>
              <td>{e.data.mortise}</td>
              <td>{e.data.section}</td>
              <td><Badge status={e.status} /></td>
              <td>{e.data.note || "—"}<br /><small className="muted">{e.updatedBy} · r{e.rev}</small></td>
              <td><History entry={e} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">截面变化或构件更换的行高亮；引用它的关系边与修缮结论会在「关系/病害」页自动失效重算，旧值见历史版本。</p>
    </div>
  );
}

export function DimensionsView({ state }: { state: State }) {
  const list = Object.values(state.dimensions).sort((a, b) => (a.id < b.id ? -1 : 1));
  const compName = (cid: string) => state.components[cid]?.data.name ?? cid;
  return (
    <div className="card-table">
      <table>
        <thead>
          <tr><th>台账号</th><th>构件</th><th>截面</th><th>长度(mm)</th><th>状态</th><th>备注</th><th>版本</th></tr>
        </thead>
        <tbody>
          {list.map((e: CanonicalEntry<DimensionRec>) => (
            <tr key={e.id} className={e.status === "conflict" ? "row-conflict" : ""}>
              <td><b>{e.id}</b></td>
              <td>{e.data.componentId} · {compName(e.data.componentId)}</td>
              <td>{e.data.section}</td>
              <td>{e.data.length}</td>
              <td><Badge status={e.status} /></td>
              <td>{e.data.note || "—"}</td>
              <td><History entry={e} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefectsView({ state }: { state: State }) {
  const list = Object.values(state.defects).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pos = (cid: string) => {
    // 落点示意：按构件摆位
    const cols: Record<string, { l: number; t: number }> = {
      Z01: { l: 8, t: 55 },
      L01: { l: 34, t: 30 },
      L02: { l: 58, t: 30 },
      L03: { l: 80, t: 30 },
      D01: { l: 34, t: 72 },
      D02: { l: 12, t: 72 },
    };
    return cols[cid] ?? { l: 50, t: 50 };
  };
  return (
    <div className="defect-wrap">
      <div className="defect-map panel-card">
        <h3>病害落点图 · 正殿</h3>
        <svg viewBox="0 0 100 56" className="plan">
          <rect x="2" y="10" width="96" height="42" rx="1" fill="#f8fafc" stroke="#d9e2ef" />
          {[
            ["Z01", 10, 46], ["L01", 34, 34], ["L02", 58, 34], ["L03", 82, 34], ["D01", 34, 46], ["D02", 14, 46],
          ].map(([id, x, y]) => (
            <g key={id as string} opacity={state.components[id as string] ? 1 : 0.25}>
              <rect x={(x as number) - 6} y={(y as number) - 5} width="12" height="9" rx="1"
                fill={state.components[id as string]?.data.replaced ? "#fef3c7" : "#eef2ff"} stroke="#94a3b8" />
              <text x={x as number} y={(y as number) + 1.5} textAnchor="middle" fontSize="3.2">{id}</text>
            </g>
          ))}
          {list.map((e: CanonicalEntry<DefectRec>) => {
            const base = pos(e.data.componentId);
            const x = base.l + (e.data.x / 100 - 0.5) * 10;
            const y = base.t - (e.data.y / 100 - 0.5) * 10 - 14;
            const color =
              e.status === "conflict" ? "#d97706"
              : e.data.severity === "重" ? "#dc2626"
              : e.data.severity === "中" ? "#d97706"
              : "#16a34a";
            return (
              <g key={e.id}>
                <circle cx={x} cy={y} r="2.4" fill={color} stroke="#1f2937" strokeWidth="0.4" />
                <text x={x} cy={y - 3.4} textAnchor="middle" fontSize="2.6">{e.id}</text>
              </g>
            );
          })}
        </svg>
        <div className="legend">
          <span><i className="dot" style={{ background: "#dc2626" }} />重度</span>
          <span><i className="dot" style={{ background: "#d97706" }} />中度/待确认</span>
          <span><i className="dot" style={{ background: "#16a34a" }} />轻度</span>
          <span><i className="box" />更换件底色</span>
        </div>
      </div>

      <div className="card-table">
        <table>
          <thead>
            <tr><th>点号</th><th>构件</th><th>病害</th><th>程度</th><th>修缮结论（派生）</th><th>状态</th><th>版本</th></tr>
          </thead>
          <tbody>
            {list.map((e: CanonicalEntry<DefectRec>) => (
              <tr key={e.id} className={e.status === "conflict" ? "row-conflict" : ""}>
                <td><b>{e.id}</b></td>
                <td>{e.data.componentId}</td>
                <td>{e.data.kind}</td>
                <td>{e.data.severity}</td>
                <td>{e.data.advice}</td>
                <td><Badge status={e.status} /></td>
                <td><History entry={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">修缮结论是派生结果：构件一换立即按新件重算（如 F-05），旧结论可在版本历史里查到。</p>
      </div>
    </div>
  );
}

// 给 svg 点着色用

export function RelationsView({
  state,
  onRecompute,
}: {
  state: State;
  onRecompute: (id: string, verdict: "reaffirm" | "rebuilt" | "retired") => void;
}) {
  const list = Object.values(state.relations).sort((a, b) => (a.id < b.id ? -1 : 1));
  // 简单分层布局：柱在下，梁在上，斗栱中下
  const coords: Record<string, { x: number; y: number }> = {
    Z01: { x: 10, y: 78 }, D02: { x: 16, y: 62 },
    L01: { x: 34, y: 26 }, L02: { x: 60, y: 26 }, L03: { x: 86, y: 26 },
    D01: { x: 34, y: 62 },
  };
  const nodes = Array.from(new Set(list.flatMap((e) => [e.data.from, e.data.to]))).filter(Boolean);
  return (
    <div className="relation-wrap">
      <div className="panel-card">
        <h3>建筑关系视图 · 正殿（虚线=换件后失效待重算）</h3>
        <svg viewBox="0 0 100 92" className="graph">
          {list.map((e: CanonicalEntry<RelationRec>) => {
            const a = coords[e.data.from] ?? { x: 50, y: 50 };
            const b = coords[e.data.to] ?? { x: 60, y: 50 };
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 4;
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.status === "invalid" ? "#dc2626" : e.status === "conflict" ? "#d97706" : "#475569"}
                  strokeWidth="0.8"
                  strokeDasharray={e.status === "invalid" ? "2 1.6" : undefined} />
                <text x={mx} y={my} textAnchor="middle" fontSize="2.8" fill="#334155">
                  {e.id}·{e.data.kind}
                </text>
              </g>
            );
          })}
          {nodes.map((id) => {
            const c = coords[id] ?? { x: 50, y: 50 };
            const comp = state.components[id];
            return (
              <g key={id}>
                <rect x={c.x - 6} y={c.y - 5} width="12" height="9" rx="1"
                  fill={comp?.data.replaced ? "#fef3c7" : "#ffffff"} stroke="#0f766e" strokeWidth="0.6" />
                <text x={c.x} y={c.y + 1.6} textAnchor="middle" fontSize="3">{id}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="card-table">
        <table>
          <thead>
            <tr><th>边号</th><th>关系</th><th>类型</th><th>状态</th><th>失效原因 / 备注</th><th>重算</th><th>版本</th></tr>
          </thead>
          <tbody>
            {list.map((e: CanonicalEntry<RelationRec>) => (
              <tr key={e.id} className={e.status === "conflict" ? "row-conflict" : e.status === "invalid" ? "row-invalid" : ""}>
                <td><b>{e.id}</b></td>
                <td>{e.data.from} → {e.data.to}</td>
                <td>{e.data.kind}</td>
                <td><Badge status={e.status} /></td>
                <td>{e.invalidReason ?? e.data.note ?? "—"}</td>
                <td>
                  {e.status === "invalid" && (
                    <div className="btn-row tight">
                      <button onClick={() => onRecompute(e.id, "rebuilt")}>按新件重接</button>
                      <button onClick={() => onRecompute(e.id, "reaffirm")}>复核维持</button>
                      <button onClick={() => onRecompute(e.id, "retired")}>判废归档</button>
                    </div>
                  )}
                </td>
                <td><History entry={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
