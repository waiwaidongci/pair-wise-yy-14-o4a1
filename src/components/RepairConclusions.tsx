// 修缮结论：由构件数据推导，引用构件版本，尺寸变更后失效需重算
import { useDatabase, recalculateStale } from "../lib/store";
import { Badge, Empty, Panel, Stat } from "./ui";

export function RepairConclusions() {
  const db = useDatabase();
  const conclusions = db.repairConclusions;
  const valid = conclusions.filter((c) => c.status === "valid");
  const stale = conclusions.filter((c) => c.status === "stale");

  return (
    <Panel
      title="修缮结论"
      subtitle="由构件数据推导，引用构件版本；尺寸变更后失效需重算"
      action={
        <button
          className="primary"
          disabled={stale.length === 0}
          onClick={() => recalculateStale()}
        >
          重算失效结论（{stale.length}）
        </button>
      }
    >
      <div className="stats-row">
        <Stat label="结论总数" value={conclusions.length} />
        <Stat label="有效" value={valid.length} tone="success" />
        <Stat label="失效" value={stale.length} tone="danger" />
      </div>

      {conclusions.length === 0 ? (
        <Empty>暂无修缮结论</Empty>
      ) : (
        <div className="conclusion-list">
          {conclusions.map((c) => (
            <div
              key={c.id}
              className={`conclusion-card ${c.status === "stale" ? "is-stale" : ""}`}
            >
              <div className="conclusion-head">
                <Badge tone={c.status === "stale" ? "danger" : "success"}>
                  {c.status === "stale" ? "失效" : "有效"}
                </Badge>
                <strong>{c.componentNo}</strong>
                <span className="muted">引用 v{c.componentVersion}</span>
              </div>
              <p className="conclusion-text">{c.conclusion}</p>
              {c.status === "stale" && (
                <p className="stale-reason">{c.staleReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
