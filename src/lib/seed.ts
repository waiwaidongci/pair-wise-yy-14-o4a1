// 演示数据：预置一批构件、关系边、修缮结论，制造并发冲突与尺寸变更场景
import type { Component, Database } from "../types";
import { addRelationEdge, addRepairConclusion } from "./merge";
import { emptyDatabase, saveDatabase, uid } from "./db";

function comp(
  partial: Partial<Component> & Pick<Component, "componentNo" | "buildingName">
): Component {
  return {
    id: uid("comp"),
    timberType: "",
    tenonType: "",
    sectionSize: "",
    diseaseLocation: "",
    deformation: "",
    repairSuggestion: "",
    version: 1,
    basedOnVersion: null,
    status: "active",
    replacedBy: null,
    batchId: null,
    measurementDate: "2026-09-20",
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

/** 构造一个带冲突与失效场景的演示库 */
export function buildSeedDatabase(): Database {
  const db = emptyDatabase();

  // —— 同兴寺大殿：已有构件 ——
  // 梁架A-03：v1 原始记录，甲方（先到）已改为 v2（病害位置"梁端北侧"→"梁端"）
  // 乙方（后到）基于 v1 又改了一版 → 合并时两边都改过，触发冲突保留
  const beamV1 = comp({
    componentNo: "梁架A-03",
    buildingName: "同兴寺大殿",
    timberType: "楠木",
    tenonType: "透榫",
    sectionSize: "180x240mm",
    diseaseLocation: "梁端北侧",
    deformation: "端部开裂",
    repairSuggestion: "建议局部墩接",
    measurementDate: "2026-09-20",
    version: 1,
    basedOnVersion: null,
    status: "superseded",
  });
  const beam = comp({
    componentNo: "梁架A-03",
    buildingName: "同兴寺大殿",
    timberType: "楠木",
    tenonType: "透榫",
    sectionSize: "180x240mm",
    diseaseLocation: "梁端",
    deformation: "端部开裂",
    repairSuggestion: "建议局部墩接",
    measurementDate: "2026-09-20",
    version: 2,
    basedOnVersion: 1,
    status: "active",
  });
  beamV1.replacedBy = beam.id;

  // 柱网C-12：v1 原始记录（甲方只录入未改），乙方基于 v1 改 → 干净更新
  const column = comp({
    componentNo: "柱网C-12",
    buildingName: "同兴寺大殿",
    timberType: "楠木",
    tenonType: "半榫",
    sectionSize: "300x300mm",
    diseaseLocation: "柱脚",
    deformation: "柱脚糟朽",
    repairSuggestion: "建议局部墩接",
    measurementDate: "2026-09-20",
  });
  const dougong = comp({
    componentNo: "斗拱D-07",
    buildingName: "同兴寺大殿",
    timberType: "杉木",
    tenonType: "半榫",
    sectionSize: "120x180mm",
    diseaseLocation: "拱身",
    deformation: "轻微变形",
    repairSuggestion: "继续监测",
    measurementDate: "2026-09-20",
  });
  db.components.push(beamV1, beam, column, dougong);

  // 关系边：梁-柱 榫接，引用 v1
  addRelationEdge(db, {
    buildingName: "同兴寺大殿",
    fromComponentNo: "梁架A-03",
    toComponentNo: "柱网C-12",
    relationType: "榫接",
    fromComponentVersion: 1,
    toComponentVersion: 1,
  });
  addRelationEdge(db, {
    buildingName: "同兴寺大殿",
    fromComponentNo: "斗拱D-07",
    toComponentNo: "梁架A-03",
    relationType: "搭接",
    fromComponentVersion: 1,
    toComponentVersion: 1,
  });

  // 修缮结论
  addRepairConclusion(db, {
    buildingName: "同兴寺大殿",
    componentNo: "柱网C-12",
    componentVersion: 1,
    conclusion: "柱脚糟朽需墩接，承重能力下降约 15%",
  });
  addRepairConclusion(db, {
    buildingName: "同兴寺大殿",
    componentNo: "梁架A-03",
    componentVersion: 1,
    conclusion: "梁端开裂需墩接，建议增设支撑",
  });

  saveDatabase(db);
  return db;
}

/** 构造一批"回站上传"的构件数据（用于演示合并） */
export function buildIncomingBatch(): Component[] {
  // 梁架A-03：甲方改了病害位置（基于 v1），乙方也改了修缮建议（基于 v1）→ 冲突
  // 这里模拟"后到的一份"：它基于 v1，但当前库已是 v1（甲方先到）
  const beamB = comp({
    componentNo: "梁架A-03",
    buildingName: "同兴寺大殿",
    timberType: "楠木",
    tenonType: "透榫",
    sectionSize: "180x240mm",
    diseaseLocation: "梁端北侧",
    deformation: "端部开裂",
    repairSuggestion: "建议局部墩接并增设钢板",
    measurementDate: "2026-09-22",
    basedOnVersion: 1,
  });

  // 柱网C-12：干净更新，截面尺寸变化 → 触发失效
  const columnB = comp({
    componentNo: "柱网C-12",
    buildingName: "同兴寺大殿",
    timberType: "楠木",
    tenonType: "半榫",
    sectionSize: "320x320mm", // 尺寸变了
    diseaseLocation: "柱脚",
    deformation: "柱脚糟朽加剧",
    repairSuggestion: "建议局部墩接并防腐处理",
    measurementDate: "2026-09-22",
    basedOnVersion: 1,
  });

  // 新构件
  const newComp = comp({
    componentNo: "檩条L-05",
    buildingName: "同兴寺大殿",
    timberType: "杉木",
    tenonType: "燕尾榫",
    sectionSize: "100x160mm",
    diseaseLocation: "无",
    deformation: "完好",
    repairSuggestion: "继续监测",
    measurementDate: "2026-09-22",
  });

  return [beamB, columnB, newComp];
}
