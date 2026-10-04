// 尺寸台账：构件截面尺寸记录，尺寸变更留痕
import { useMemo } from "react";
import { useDatabase } from "../lib/store";
import { Badge, Empty, Panel } from "./ui";

export function DimensionLedger() {
  const db = useDatabase();

  // 按构件编号聚合尺寸变更历史
  const ledger = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        version: number;
        sectionSize: string;
        measurementDate: string;
        status: string;
        replacedBy: string | null;
      }>
    >();
    for (const c of db.components) {
      if (!map.has(c.componentNo)) map.set(c.componentNo, []);
      map.get(c.componentNo)!.push({
        version: c.version,
        sectionSize: c.sectionSize,
        measurementDate: c.measurementDate,
        status: c.status,
        replacedBy: c.replacedBy,
      });
    }
    for (const list of map.values()) list.sort((a, b) => a.version - b.version);
    return map;
  }, [db.components]);

  return (
    <Panel title="尺寸台账" subtitle="构件截面尺寸记录，变更留痕可追溯">
      {ledger.size === 0 ? (
        <Empty>暂无尺寸记录</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>构件编号</th>
                <th>版本</th>
                <th>截面尺寸</th>
                <th>测量日期</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(ledger.entries()).map(([no, rows]) =>
                rows.map((r, i) => (
                  <tr key={`${no}-${r.version}`}>
                    <td className="cell-strong">
                      {i === 0 ? no : ""}
                    </td>
                    <td>
                      <Badge tone="info">v{r.version}</Badge>
                    </td>
                    <td className="cell-mono">{r.sectionSize || "—"}</td>
                    <td className="cell-mono">{r.measurementDate}</td>
                    <td>
                      <Badge tone={r.status === "active" ? "success" : "default"}>
                        {r.status === "active" ? "当前" : "已替代"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
