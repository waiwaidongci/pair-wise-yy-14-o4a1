// 冲突待确认：同一构件两边都改过时保留两份，人工确认保留哪份
import { useState } from "react";
import { useDatabase, resolveConflict } from "../lib/store";
import { Badge, Empty, Panel } from "./ui";

export function ConflictPanel() {
  const db = useDatabase();
  const [, force] = useState(0);

  const pending = db.conflicts.filter((c) => c.status === "pending");
  const resolved = db.conflicts.filter((c) => c.status === "resolved");

  const handleResolve = (id: string, keep: "keepA" | "keepB") => {
    resolveConflict(id, keep);
    force((n) => n + 1);
  };

  return (
    <Panel
      title="冲突待确认"
      subtitle={`同一构件两边都改过时保留两份，后到记录不覆盖 · 待确认 ${pending.length}`}
    >
      {pending.length === 0 ? (
        <Empty>没有待确认的冲突。合并时若两边都基于旧版本修改，会在此保留两份。</Empty>
      ) : (
        <div className="conflict-list">
          {pending.map((c) => (
            <div key={c.id} className="conflict-card">
              <div className="conflict-head">
                <Badge tone="warning">待确认</Badge>
                <strong>{c.componentNo}</strong>
                <span className="muted">{c.buildingName}</span>
                <span className="muted">共同祖先 v{c.baseVersion}</span>
              </div>

              <div className="conflict-sides">
                <div className="conflict-side">
                  <div className="side-head">
                    <Badge tone="info">A · 先到（库内当前）</Badge>
                    <span className="muted">v{c.sideA.version}</span>
                  </div>
                  <dl>
                    <div><dt>木材</dt><dd>{c.sideA.timberType || "—"}</dd></div>
                    <div><dt>榫卯</dt><dd>{c.sideA.tenonType || "—"}</dd></div>
                    <div><dt>截面</dt><dd>{c.sideA.sectionSize || "—"}</dd></div>
                    <div><dt>病害</dt><dd>{c.sideA.diseaseLocation || "—"}</dd></div>
                    <div><dt>变形</dt><dd>{c.sideA.deformation || "—"}</dd></div>
                    <div><dt>修缮</dt><dd>{c.sideA.repairSuggestion || "—"}</dd></div>
                  </dl>
                  <button className="primary" onClick={() => handleResolve(c.id, "keepA")}>
                    保留 A
                  </button>
                </div>

                <div className="conflict-side">
                  <div className="side-head">
                    <Badge tone="accent">B · 后到（本次上传）</Badge>
                    <span className="muted">v{c.sideB.version}</span>
                  </div>
                  <dl>
                    <div><dt>木材</dt><dd>{c.sideB.timberType || "—"}</dd></div>
                    <div><dt>榫卯</dt><dd>{c.sideB.tenonType || "—"}</dd></div>
                    <div><dt>截面</dt><dd>{c.sideB.sectionSize || "—"}</dd></div>
                    <div><dt>病害</dt><dd>{c.sideB.diseaseLocation || "—"}</dd></div>
                    <div><dt>变形</dt><dd>{c.sideB.deformation || "—"}</dd></div>
                    <div><dt>修缮</dt><dd>{c.sideB.repairSuggestion || "—"}</dd></div>
                  </dl>
                  <button className="accent" onClick={() => handleResolve(c.id, "keepB")}>
                    保留 B
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="resolved-block">
          <h3>已确认（{resolved.length}）</h3>
          <div className="chips">
            {resolved.map((c) => (
              <span key={c.id} className="chip">
                {c.componentNo} · 保留 {c.resolution === "keepA" ? "A" : "B"}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
