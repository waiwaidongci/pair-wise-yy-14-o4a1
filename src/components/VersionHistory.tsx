// 版本历史：构件更换后旧版本仍可查；关系边/修缮结论失效后旧成果仍可查
import { useMemo, useState } from "react";
import { useDatabase } from "../lib/store";
import { Badge, Empty, Panel } from "./ui";

export function VersionHistory() {
  const db = useDatabase();
  const [selected, setSelected] = useState<string | null>(null);

  // 按构件编号聚合所有版本
  const grouped = useMemo(() => {
    const map = new Map<string, typeof db.components>();
    for (const c of db.components) {
      const key = `${c.buildingName}__${c.componentNo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.version - b.version);
    }
    return map;
  }, [db.components]);

  const selectedVersions = selected ? grouped.get(selected) ?? [] : [];

  return (
    <Panel
      title="版本历史"
      subtitle="构件更换后旧版本保留可查；失效的关系边与修缮结论旧成果仍可查"
    >
      {grouped.size === 0 ? (
        <Empty>暂无版本记录</Empty>
      ) : (
        <div className="history-layout">
          <div className="history-list">
            {Array.from(grouped.entries()).map(([key, versions]) => {
              const active = versions.find((v) => v.status === "active");
              const superseded = versions.filter((v) => v.status === "superseded");
              return (
                <button
                  key={key}
                  className={selected === key ? "history-item active" : "history-item"}
                  onClick={() => setSelected(key)}
                >
                  <div>
                    <strong>{active?.componentNo ?? versions[0].componentNo}</strong>
                    <p className="muted">{versions[0].buildingName}</p>
                  </div>
                  <div className="history-badges">
                    <Badge tone="success">当前 v{active?.version ?? "-"}</Badge>
                    {superseded.length > 0 && (
                      <Badge tone="default">历史 {superseded.length}</Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="history-detail">
            {!selected ? (
              <Empty>选择一个构件查看版本演进</Empty>
            ) : (
              <div className="version-timeline">
                {selectedVersions.map((v) => (
                  <div key={v.id} className="version-row">
                    <div className="version-marker">
                      <Badge tone={v.status === "active" ? "success" : "default"}>
                        v{v.version}
                      </Badge>
                      {v.status === "superseded" && (
                        <span className="muted">已被替代</span>
                      )}
                    </div>
                    <div className="version-body">
                      <div className="version-grid">
                        <div><span>木材</span><b>{v.timberType || "—"}</b></div>
                        <div><span>榫卯</span><b>{v.tenonType || "—"}</b></div>
                        <div><span>截面</span><b className="cell-mono">{v.sectionSize || "—"}</b></div>
                        <div><span>病害</span><b>{v.diseaseLocation || "—"}</b></div>
                        <div><span>变形</span><b>{v.deformation || "—"}</b></div>
                        <div><span>修缮</span><b>{v.repairSuggestion || "—"}</b></div>
                      </div>
                      <p className="muted version-meta">
                        批次 {v.batchId ?? "原始"} · 测量 {v.measurementDate} ·{" "}
                        {new Date(v.updatedAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <StaleArchive />
    </Panel>
  );
}

/** 失效成果归档：旧关系边与旧修缮结论仍可查 */
function StaleArchive() {
  const db = useDatabase();
  const staleEdges = db.relationEdges.filter((e) => e.status === "stale");
  const staleConclusions = db.repairConclusions.filter((c) => c.status === "stale");

  if (staleEdges.length === 0 && staleConclusions.length === 0) return null;

  return (
    <div className="stale-archive">
      <h3>失效成果归档（仍可查）</h3>
      <div className="stale-grid">
        {staleEdges.map((e) => (
          <div key={e.id} className="stale-card">
            <Badge tone="danger">失效</Badge>
            <strong>
              {e.fromComponentNo} → {e.toComponentNo}
            </strong>
            <p className="muted">{e.relationType}</p>
            <p className="stale-reason">{e.staleReason}</p>
          </div>
        ))}
        {staleConclusions.map((c) => (
          <div key={c.id} className="stale-card">
            <Badge tone="danger">失效</Badge>
            <strong>{c.componentNo}</strong>
            <p>{c.conclusion}</p>
            <p className="stale-reason">{c.staleReason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
