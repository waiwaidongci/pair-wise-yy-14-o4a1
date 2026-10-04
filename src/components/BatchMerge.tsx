// 批次合并：回站后上传批次，合并构件清单/尺寸台账/病害落点/建筑关系
// 演示幂等、冲突保留、断点续传
import { useState } from "react";
import { useDatabase, mergeBatch, setFailureSim } from "../lib/store";
import { buildIncomingBatch } from "../lib/seed";
import { Badge, Panel, Stat } from "./ui";
import type { MergeResult } from "../types";

export function BatchMerge() {
  const db = useDatabase();
  const [batchNo, setBatchNo] = useState("PC-2026-0922");
  const [buildingName, setBuildingName] = useState("同兴寺大殿");
  const [measurementDate, setMeasurementDate] = useState("2026-09-22");
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulateFail, setSimulateFail] = useState(false);
  const [failAt, setFailAt] = useState(1);

  const incoming = buildIncomingBatch();

  const handleMerge = (resume = false) => {
    setError(null);
    setFailureSim(simulateFail, simulateFail ? failAt : 0);
    try {
      const r = mergeBatch(
        incoming,
        {
          batchNo: batchNo.trim() || null,
          buildingName,
          measurementDate,
        },
        resume
      );
      setResult(r.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "合并失败");
    }
  };

  const handleResume = () => handleMerge(true);

  const pendingBatches = db.batches.filter(
    (b) => b.status === "draft" || b.status === "archived"
  );

  return (
    <Panel
      title="批次合并"
      subtitle="断网各记一份，回站后同步合并到同一测绘批次"
      action={
        <Badge tone={simulateFail ? "danger" : "default"}>
          {simulateFail ? "模拟保存失败：开" : "模拟保存失败：关"}
        </Badge>
      }
    >
      <div className="merge-grid">
        <div className="merge-form">
          <h3>上传批次</h3>
          <label>
            <span>批次号（留空则按测量日期归档）</span>
            <input
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="如 PC-2026-0922"
            />
          </label>
          <label>
            <span>建筑名称</span>
            <input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
            />
          </label>
          <label>
            <span>测量日期</span>
            <input
              type="date"
              value={measurementDate}
              onChange={(e) => setMeasurementDate(e.target.value)}
            />
          </label>

          <div className="sim-row">
            <label className="check">
              <input
                type="checkbox"
                checked={simulateFail}
                onChange={(e) => setSimulateFail(e.target.checked)}
              />
              <span>模拟保存失败（演示断点续传）</span>
            </label>
            {simulateFail && (
              <label className="fail-at">
                <span>失败于第</span>
                <input
                  type="number"
                  min={1}
                  max={incoming.length}
                  value={failAt}
                  onChange={(e) => setFailAt(Number(e.target.value))}
                />
                <span>条后</span>
              </label>
            )}
          </div>

          <div className="btn-row">
            <button className="primary" onClick={() => handleMerge(false)}>
              合并本批 {incoming.length} 件
            </button>
            {result?.interrupted && (
              <button className="accent" onClick={handleResume}>
                从检查点续传（第 {result.checkpoint} 条）
              </button>
            )}
          </div>

          {error && <p className="error-box">错误：{error}</p>}
        </div>

        <div className="merge-preview">
          <h3>本批数据预览</h3>
          <div className="preview-list">
            {incoming.map((c, i) => (
              <div key={i} className="preview-item">
                <Badge tone="info">#{i + 1}</Badge>
                <div>
                  <strong>{c.componentNo}</strong>
                  <p>
                    {c.timberType} · {c.tenonType} · {c.sectionSize}
                  </p>
                  <p className="muted">
                    {c.diseaseLocation} · {c.deformation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div className="merge-result">
          <div className="stats-row">
            <Stat label="总数" value={result.total} />
            <Stat label="新增" value={result.inserted} tone="success" />
            <Stat label="更新" value={result.updated} tone="accent" />
            <Stat label="冲突待确认" value={result.conflicts} tone="warning" />
            <Stat label="无变化" value={result.unchanged} />
            <Stat
              label="检查点"
              value={`${result.checkpoint}/${result.total}`}
              tone={result.interrupted ? "danger" : "default"}
            />
          </div>

          {result.idempotentHit && (
            <p className="notice info">
              幂等命中：该批次已合并过，本次直接返回第一次结果，未重复处理。
            </p>
          )}
          {result.interrupted && (
            <p className="notice danger">
              保存中断：已恢复到最后确认的第 {result.checkpoint} 条构件，可点击续传继续。
            </p>
          )}

          <h3>合并动作明细</h3>
          <div className="action-list">
            {result.actions.map((a, i) => (
              <div key={i} className={`action-item action-${a.action}`}>
                <Badge
                  tone={
                    a.action === "inserted"
                      ? "success"
                      : a.action === "updated"
                      ? "accent"
                      : a.action === "conflict"
                      ? "warning"
                      : a.action === "unchanged"
                      ? "default"
                      : "danger"
                  }
                >
                  {a.action === "inserted"
                    ? "新增"
                    : a.action === "updated"
                    ? "更新"
                    : a.action === "conflict"
                    ? "冲突"
                    : a.action === "unchanged"
                    ? "无变化"
                    : "中断"}
                </Badge>
                <div>
                  <strong>{a.componentNo}</strong>
                  <p>{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingBatches.length > 0 && (
        <div className="pending-batches">
          <h3>批次归档（{pendingBatches.length}）</h3>
          <div className="chips">
            {pendingBatches.map((b) => (
              <span key={b.id} className="chip">
                {b.batchNo ?? `草稿·${b.measurementDate}`} · {b.status}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
