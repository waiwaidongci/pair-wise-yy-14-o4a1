// 构件清单：展示当前生效构件，支持榫卯类型筛选与搜索
import { useMemo, useState } from "react";
import { useDatabase } from "../lib/store";
import { Badge, Empty, Panel } from "./ui";

const TENON_FILTERS = ["全部", "燕尾榫", "透榫", "半榫", "箍头榫"];

export function ComponentList() {
  const db = useDatabase();
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");

  const active = useMemo(
    () => db.components.filter((c) => c.status === "active"),
    [db.components]
  );

  const filtered = useMemo(() => {
    return active.filter((c) => {
      if (filter !== "全部" && c.tenonType !== filter) return false;
      if (query) {
        const q = query.trim();
        return (
          c.componentNo.includes(q) ||
          c.buildingName.includes(q) ||
          c.timberType.includes(q)
        );
      }
      return true;
    });
  }, [active, filter, query]);

  return (
    <Panel
      title="构件清单"
      subtitle={`当前生效 ${active.length} 件 · 共 ${db.components.length} 个版本`}
      action={
        <input
          className="search-input"
          placeholder="搜索构件编号 / 建筑 / 木材"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      }
    >
      <div className="chips">
        {TENON_FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? "chip active" : "chip"}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty>暂无符合条件的构件</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>构件编号</th>
                <th>建筑名称</th>
                <th>木材</th>
                <th>榫卯类型</th>
                <th>截面尺寸</th>
                <th>病害位置</th>
                <th>变形情况</th>
                <th>版本</th>
                <th>测量日期</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="cell-strong">{c.componentNo}</td>
                  <td>{c.buildingName}</td>
                  <td>{c.timberType || "—"}</td>
                  <td>
                    {c.tenonType ? (
                      <Badge tone="accent">{c.tenonType}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="cell-mono">{c.sectionSize || "—"}</td>
                  <td>{c.diseaseLocation || "—"}</td>
                  <td>{c.deformation || "—"}</td>
                  <td>
                    <Badge tone="info">v{c.version}</Badge>
                  </td>
                  <td className="cell-mono">{c.measurementDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
