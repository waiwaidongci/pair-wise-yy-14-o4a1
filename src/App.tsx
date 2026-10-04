import { useEffect, useState } from "react";
import "./styles.css";
import { useDatabase, seedIfEmpty, resetToSeed, clearAll } from "./lib/store";
import { ComponentList } from "./components/ComponentList";
import { BatchMerge } from "./components/BatchMerge";
import { ConflictPanel } from "./components/ConflictPanel";
import { VersionHistory } from "./components/VersionHistory";
import { RelationView } from "./components/RelationView";
import { DimensionLedger } from "./components/DimensionLedger";
import { DiseaseMap } from "./components/DiseaseMap";
import { RepairConclusions } from "./components/RepairConclusions";
import { Badge } from "./components/ui";

const TABS = [
  { key: "components", label: "构件清单" },
  { key: "merge", label: "批次合并" },
  { key: "conflicts", label: "冲突待确认" },
  { key: "relations", label: "关系视图" },
  { key: "conclusions", label: "修缮结论" },
  { key: "ledger", label: "尺寸台账" },
  { key: "disease", label: "病害标记图" },
  { key: "history", label: "版本历史" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function App() {
  const db = useDatabase();
  const [tab, setTab] = useState<TabKey>("components");

  useEffect(() => {
    seedIfEmpty();
  }, []);

  const activeCount = db.components.filter((c) => c.status === "active").length;
  const conflictCount = db.conflicts.filter((c) => c.status === "pending").length;
  const staleEdgeCount = db.relationEdges.filter((e) => e.status === "stale").length;
  const staleConcCount = db.repairConclusions.filter((c) => c.status === "stale").length;

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-top">
          <div>
            <p className="hero-tag">古建木结构 · 榫卯构件测绘 · 离线同步</p>
            <h1>断网测绘与回站合并</h1>
            <p className="hero-sub">
              几支测绘队分头进不同古建，断网时各记一份，回站后同步合并同一建筑的构件截面、木材和病害落点。
              并发修改保留两份待确认，尺寸变更立即失效重算，保存失败断点续传，重传只认第一次，无批次号按日期归档。
            </p>
          </div>
          <div className="hero-actions">
            <button onClick={resetToSeed}>重置演示数据</button>
            <button onClick={clearAll}>清空</button>
          </div>
        </div>

        <div className="hero-metrics">
          <div className="hero-metric">
            <strong>{activeCount}</strong>
            <span>当前构件</span>
          </div>
          <div className="hero-metric">
            <strong>{conflictCount}</strong>
            <span>待确认冲突</span>
          </div>
          <div className="hero-metric">
            <strong>{staleEdgeCount + staleConcCount}</strong>
            <span>待重算成果</span>
          </div>
          <div className="hero-metric">
            <strong>{db.batches.length}</strong>
            <span>已归档批次</span>
          </div>
        </div>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "conflicts" && conflictCount > 0 && (
              <Badge tone="danger">{conflictCount}</Badge>
            )}
            {t.key === "relations" && staleEdgeCount > 0 && (
              <Badge tone="warning">{staleEdgeCount}</Badge>
            )}
            {t.key === "conclusions" && staleConcCount > 0 && (
              <Badge tone="warning">{staleConcCount}</Badge>
            )}
          </button>
        ))}
      </nav>

      <section className="tab-body">
        {tab === "components" && <ComponentList />}
        {tab === "merge" && <BatchMerge />}
        {tab === "conflicts" && <ConflictPanel />}
        {tab === "relations" && <RelationView />}
        {tab === "conclusions" && <RepairConclusions />}
        {tab === "ledger" && <DimensionLedger />}
        {tab === "disease" && <DiseaseMap />}
        {tab === "history" && <VersionHistory />}
      </section>

      <footer className="footer">
        <p>
          数据存储于浏览器本地（localStorage），演示离线录入与回站合并流程。
          合并引擎：并发冲突保留 · 尺寸变更失效 · 断点续传 · 批次幂等 · 日期归档。
        </p>
      </footer>
    </main>
  );
}
