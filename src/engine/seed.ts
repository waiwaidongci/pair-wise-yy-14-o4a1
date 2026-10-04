import { Payload, State } from "./types";

// 站上已有基线（上次测绘成果，全部 rev=1）
export function baselineState(): State {
  const components = [
    { id: "Z01", building: "正殿", name: "前檐柱", wood: "楠木", mortise: "箍头榫", section: "φ320", note: "柱身完好", measuredAt: "2026-09-20" },
    { id: "L01", building: "正殿", name: "五架梁", wood: "榆木", mortise: "透榫", section: "180×240", note: "", measuredAt: "2026-09-20" },
    { id: "L02", building: "正殿", name: "三穿梁", wood: "榆木", mortise: "燕尾榫", section: "150×200", note: "", measuredAt: "2026-09-20" },
    { id: "L03", building: "正殿", name: "随梁枋", wood: "松木", mortise: "半榫", section: "120×160", note: "", measuredAt: "2026-09-20" },
    { id: "D01", building: "正殿", name: "平身科斗栱", wood: "楠木", mortise: "半榫", section: "80×120", note: "", measuredAt: "2026-09-20" },
  ];
  const dimensions = [
    { id: "C-Z01", componentId: "Z01", section: "φ320", length: 3200, note: "柱脚标高复核", measuredAt: "2026-09-20" },
    { id: "C-L01", componentId: "L01", section: "180×240", length: 4200, note: "", measuredAt: "2026-09-20" },
    { id: "C-L02", componentId: "L02", section: "150×200", length: 3100, note: "", measuredAt: "2026-09-20" },
    { id: "C-L03", componentId: "L03", section: "120×160", length: 3600, note: "", measuredAt: "2026-09-20" },
  ];
  const defects = [
    { id: "F-01", componentId: "L01", kind: "端部开裂", x: 22, y: 35, severity: "中" as const, advice: "端部嵌补，周期复查", measuredAt: "2026-09-20" },
    { id: "F-02", componentId: "Z01", kind: "柱脚糟朽", x: 50, y: 92, severity: "中" as const, advice: "局部剔补防腐，继续监测", measuredAt: "2026-09-20" },
    { id: "F-05", componentId: "L03", kind: "中部开裂", x: 60, y: 50, severity: "重" as const, advice: "裂缝注胶加箍，纳入修缮计划", measuredAt: "2026-09-20" },
  ];
  const relations = [
    { id: "R-01", building: "正殿", from: "Z01", to: "L01", kind: "箍头榫", note: "前檐柱头承五架梁", measuredAt: "2026-09-20" },
    { id: "R-02", building: "正殿", from: "L01", to: "L02", kind: "燕尾榫", note: "梁间拉结", measuredAt: "2026-09-20" },
    { id: "R-03", building: "正殿", from: "L02", to: "L03", kind: "半榫", note: "", measuredAt: "2026-09-20" },
  ];

  const mk = <T,>(type: any, rec: T) => ({
    id: (rec as any).id,
    type,
    data: rec,
    rev: 1,
    status: "active" as const,
    updatedBy: "基线测绘",
    updatedAt: "2026-09-20T09:00:00Z",
    candidates: [],
    history: [],
  });

  return {
    building: "正殿",
    components: Object.fromEntries(components.map((r) => [r.id, mk("component", r)])),
    dimensions: Object.fromEntries(dimensions.map((r) => [r.id, mk("dimension", r)])),
    defects: Object.fromEntries(defects.map((r) => [r.id, mk("defect", r)])),
    relations: Object.fromEntries(relations.map((r) => [r.id, mk("relation", r)])),
    batches: {},
    archives: [],
    log: [{ at: "2026-09-20T09:00:00Z", level: "info" as const, text: "站上基线数据就绪（rev=1），两队离线出发" }],
  };
}

/** 甲队：先到。三穿梁 L02 整根更换；随梁枋截面复测变化；另含一组会保存失败的新构件 */
export const teamAPayload: Payload = {
  batchId: "BATCH-20261004-A",
  team: "甲队",
  measuredAt: "2026-10-03",
  components: [
    { baseRev: 1, data: { id: "L02", building: "正殿", name: "三穿梁(更换)", wood: "榆木", mortise: "燕尾榫", section: "155×205", replaced: true, note: "原梁糟朽超标，落架更换", measuredAt: "2026-10-03" } },
    { baseRev: 1, data: { id: "L03", building: "正殿", name: "随梁枋(更换)", wood: "松木", mortise: "半榫", section: "125×165", replaced: true, note: "糟朽段截换", measuredAt: "2026-10-03" } },
    { baseRev: 0, data: { id: "D02", building: "正殿", name: "柱头科斗栱", wood: "楠木", mortise: "透榫", section: "90×130", note: "新补编号", measuredAt: "2026-10-03" } },
  ],
  dimensions: [
    { baseRev: 1, data: { id: "C-L02", componentId: "L02", section: "155×205", length: 3120, note: "更换件实测", measuredAt: "2026-10-03" } },
    { baseRev: 1, data: { id: "C-L03", componentId: "L03", section: "125×165", length: 3600, note: "截面复测", measuredAt: "2026-10-03" } },
    { baseRev: 0, data: { id: "C-D02", componentId: "D02", section: "90×130", length: 680, note: "", measuredAt: "2026-10-03" } },
  ],
  defects: [
    { baseRev: 1, data: { id: "F-01", componentId: "L01", kind: "端部开裂", x: 22, y: 35, severity: "轻", advice: "端部嵌补，周期复查", note: "甲队判断仅表层", measuredAt: "2026-10-03" } as any },
    { baseRev: 1, data: { id: "F-05", componentId: "L03", kind: "中部开裂", x: 60, y: 50, severity: "重", advice: "裂缝注胶加箍，纳入修缮计划", note: "随旧件截除", measuredAt: "2026-10-03" } },
    { baseRev: 0, data: { id: "F-10", componentId: "D01", kind: "轻微变形", x: 70, y: 40, severity: "轻", advice: "校正支顶并复测榫卯间隙", measuredAt: "2026-10-03" } },
  ],
  relations: [
    { baseRev: 1, data: { id: "R-01", building: "正殿", from: "Z01", to: "L01", kind: "箍头榫", note: "节点完好，仅卯口磨损", measuredAt: "2026-10-03" } },
    { baseRev: 0, data: { id: "R-10", building: "正殿", from: "D02", to: "L01", kind: "透榫", note: "新补斗栱与梁的关系", measuredAt: "2026-10-03" } },
  ],
};

/** 乙队：晚到。与甲队改了同一构件/关系/病害（基于 rev=1 的离线基线）→ 双方改动，双留待确认 */
export const teamBPayload: Payload = {
  batchId: "BATCH-20261004-A",
  team: "乙队",
  measuredAt: "2026-10-03",
  components: [
    { baseRev: 1, data: { id: "L02", building: "正殿", name: "三穿梁", wood: "榆木", mortise: "燕尾榫", section: "150×200", note: "梁身开槽加固，维持原构件", measuredAt: "2026-10-03" } },
    { baseRev: 1, data: { id: "Z01", building: "正殿", name: "前檐柱", wood: "柏木", mortise: "箍头榫", section: "φ320", note: "树种复核应为柏木", measuredAt: "2026-10-03" } },
  ],
  dimensions: [],
  defects: [
    { baseRev: 1, data: { id: "F-01", componentId: "L01", kind: "端部开裂", x: 22, y: 35, severity: "重", advice: "裂缝注胶加箍，纳入修缮计划", note: "裂缝延伸", measuredAt: "2026-10-03" } as any },
  ],
  relations: [
    { baseRev: 1, data: { id: "R-01", building: "正殿", from: "Z01", to: "L01", kind: "箍头榫", note: "卯口实测偏北15mm，节点编号待改", measuredAt: "2026-10-03" } },
  ],
};

/** 老草稿：无批次号，按测量日期归档 */
export const legacyDraft: Payload = {
  team: "退休老师傅手记",
  measuredAt: "2026-08-15",
  components: [
    { baseRev: 0, data: { id: "X-OLD", building: "偏殿", name: "旧记梁栿", wood: "杂木", mortise: "半榫", section: "100×140", note: "字迹潦草待核", measuredAt: "2026-08-15" } },
  ],
  dimensions: [],
  defects: [],
  relations: [],
};

/** 第二次重传（内容故意不同）：验证只认第一次 */
export const teamARetry: Payload = {
  ...teamAPayload,
  components: [
    ...teamAPayload.components,
    { baseRev: 0, data: { id: "FAKE-99", building: "正殿", name: "重传伪造构件", wood: "松木", mortise: "半榫", section: "1×1", note: "不应入库", measuredAt: "2026-10-03" } },
  ],
};
