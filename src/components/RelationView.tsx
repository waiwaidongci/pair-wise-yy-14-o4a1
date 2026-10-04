// 关系视图：单栋建筑的构件关系，尺寸变更后失效边高亮，可一键重算
import { useMemo } from "react";
import { useDatabase, recalculateStale } from "../lib/store";
import { Badge, Empty, Panel, Stat } from "./ui";

export function RelationView() {
  const db = useDatabase();

  const buildings = useMemo(() => {
    const set = new Set(db.components.map((c) => c.buildingName));
    return Array.from(set);
  }, [db.components]);

  const edges = db.relationEdges;
  const staleCount = edges.filter((e) => e.status === "stale").length;
  const validCount = edges.filter((e) => e.status === "valid").length;

  const handleRecalc = () => {
    recalculateStale();
  };

  return (
    <Panel
      title="构件关系视图"
      subtitle="单栋建筑的构件关系 · 引用构件版本，尺寸一变即失效重算"
      action={
        <button
          className="primary"
          disabled={staleCount === 0}
          onClick={handleRecalc}
        >
          重算失效关系与结论（{staleCount}）
        </button>
      }
    >
      <div className="stats-row">
        <Stat label="关系边" value={edges.length} />
        <Stat label="有效" value={validCount} tone="success" />
        <Stat label="失效" value={staleCount} tone="danger" />
        <Stat label="建筑" value={buildings.length} />
      </div>

      {edges.length === 0 ? (
        <Empty>暂无构件关系边</Empty>
      ) : (
        <div className="relation-list">
          {edges.map((e) => {
            const from = db.components.find(
              (c) =>
                c.componentNo === e.fromComponentNo &&
                c.buildingName === e.buildingName &&
                c.status === "active"
            );
            const to = db.components.find(
              (c) =>
                c.componentNo === e.toComponentNo &&
                c.buildingName === e.buildingName &&
                c.status === "active"
            );
            return (
              <div
                key={e.id}
                className={`relation-card ${e.status === "stale" ? "is-stale" : ""}`}
              >
                <div className="relation-main">
                  <div className="relation-node">
                    <strong>{e.fromComponentNo}</strong>
                    <span className="muted">
                      {from ? `v${from.version}` : "已失效"}
                    </span>
                  </div>
                  <div className="relation-edge">
                    <Badge tone={e.status === "stale" ? "danger" : "accent"}>
                      {e.relationType}
                    </Badge>
                    <span className="muted">
                      {e.status === "stale"
                        ? `引用 v${e.fromComponentVersion}→v${e.toComponentVersion}`
                        : `v${e.fromComponentVersion}→v${e.toComponentVersion}`}
                    </span>
                  </div>
                  <div className="relation-node">
                    <strong>{e.toComponentNo}</strong>
                    <span className="muted">
                      {to ? `v${to.version}` : "已失效"}
                    </span>
                  </div>
                </div>
                {e.status === "stale" && (
                  <p className="stale-reason">{e.staleReason}</p>
                )}
                {e.recalculatedAt && (
                  <p className="muted recalc-meta">
                    已于 {new Date(e.recalculatedAt).toLocaleString("zh-CN")} 重算
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
