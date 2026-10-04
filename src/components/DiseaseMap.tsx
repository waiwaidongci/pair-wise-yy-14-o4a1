// 病害标记图：在建筑立面示意上标注病害落点
import { useMemo } from "react";
import { useDatabase } from "../lib/store";
import { Badge, Empty, Panel } from "./ui";

/** 病害落点坐标（百分比） */
const DISEASE_POSITIONS: Record<string, { x: number; y: number }> = {
  梁端: { x: 22, y: 30 },
  梁端北侧: { x: 30, y: 28 },
  柱脚: { x: 18, y: 78 },
  拱身: { x: 55, y: 45 },
  无: { x: 0, y: 0 },
};

export function DiseaseMap() {
  const db = useDatabase();

  const diseased = useMemo(
    () =>
      db.components.filter(
        (c) => c.status === "active" && c.diseaseLocation && c.diseaseLocation !== "无"
      ),
    [db.components]
  );

  return (
    <Panel
      title="病害标记图"
      subtitle="构件病害落点标注于建筑立面，颜色对应病害类型"
    >
      {diseased.length === 0 ? (
        <Empty>暂无病害记录</Empty>
      ) : (
        <div className="disease-map">
          <svg viewBox="0 0 400 200" className="map-svg">
            {/* 屋顶 */}
            <polygon points="20,40 200,10 380,40" fill="#854d0e" opacity="0.85" />
            {/* 梁 */}
            <rect x="30" y="45" width="340" height="14" fill="#475569" />
            {/* 柱 */}
            <rect x="60" y="59" width="16" height="120" fill="#475569" />
            <rect x="324" y="59" width="16" height="120" fill="#475569" />
            {/* 斗拱 */}
            <rect x="180" y="40" width="40" height="10" fill="#0f766e" />
            {/* 台基 */}
            <rect x="20" y="179" width="360" height="10" fill="#94a3b8" />

            {/* 病害标记 */}
            {diseased.map((c, i) => {
              const pos =
                DISEASE_POSITIONS[c.diseaseLocation] ?? {
                  x: 50 + i * 12,
                  y: 50,
                };
              if (c.diseaseLocation === "无") return null;
              return (
                <g key={c.id}>
                  <circle
                    cx={pos.x * 4}
                    cy={pos.y * 2}
                    r="7"
                    fill="#dc2626"
                    stroke="#fff"
                    strokeWidth="2"
                  >
                    <animate
                      attributeName="r"
                      values="7;10;7"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <text
                    x={pos.x * 4}
                    y={pos.y * 2 - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#172033"
                    fontWeight="600"
                  >
                    {c.componentNo}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="disease-legend">
            {diseased.map((c) => (
              <div key={c.id} className="legend-item">
                <span className="legend-dot" />
                <div>
                  <strong>{c.componentNo}</strong>
                  <p>
                    {c.diseaseLocation} · {c.deformation}
                  </p>
                </div>
                <Badge tone="danger">病害</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
