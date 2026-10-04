// 合并引擎：断网回站后，把同一建筑的构件清单、尺寸台账、病害落点、建筑关系
// 合并到同一测绘批次。核心规则：
//  1. 同一构件两边都改过时保留两份待确认，后到记录不覆盖；
//  2. 构件更换后尺寸一变，引用它的关系边/修缮结论立即失效，旧成果仍可查；
//  3. 合并中保存失败，恢复到最后确认的构件继续；
//  4. 重传同一批次只认第一次结果（幂等）；
//  5. 没有批次号的老草稿按测量日期归档。
import type {
  Batch,
  Component,
  ConflictRecord,
  Database,
  MergeProgress,
  MergeResult,
  RelationEdge,
  RepairConclusion,
} from "../types";
import { saveDatabase, uid } from "./db";

/** 模拟保存失败：用于演示断点续传。设为 true 时，写入会在随机位置抛错 */
export const failureSim = { enabled: false, failAt: 0 };

/** 幂等键：有批次号用批次号；无批次号按 日期+建筑 归档 */
export function idempotencyKeyOf(input: {
  batchNo: string | null;
  measurementDate: string;
  buildingName: string;
} ): string {
  if (input.batchNo && input.batchNo.trim()) {
    return `batch:${input.batchNo.trim()}`;
  }
  return `draft:${input.measurementDate}:${input.buildingName}`;
}

/** 在库里查找某建筑下当前生效的构件（按业务键 componentNo） */
export function findActiveComponent(
  db: Database,
  buildingName: string,
  componentNo: string
): Component | undefined {
  return db.components.find(
    (c) =>
      c.buildingName === buildingName &&
      c.componentNo === componentNo &&
      c.status === "active"
  );
}

/** 构件字段指纹：用于判断是否真的有改动 */
function fingerprint(c: Component): string {
  return [
    c.timberType,
    c.tenonType,
    c.sectionSize,
    c.diseaseLocation,
    c.deformation,
    c.repairSuggestion,
  ].join("|");
}

/**
 * 合并一批构件到数据库。
 * @param db 当前数据库（会被修改）
 * @param incoming 本次上传的构件（已带 batchId / measurementDate）
 * @param meta 批次元信息
 * @param resume 是否从断点续传
 */
export function mergeBatch(
  db: Database,
  incoming: Component[],
  meta: {
    batchNo: string | null;
    buildingName: string;
    measurementDate: string;
  },
  resume = false
): { db: Database; result: MergeResult; batch: Batch } {
  const idemKey = idempotencyKeyOf(meta);

  // —— 规则 4：幂等。重传同一批次只认第一次结果 ——
  // 仅对已完成（有完整 firstResult）的批次生效；草稿批次走续传逻辑
  const existing = db.batches.find(
    (b) =>
      b.idempotencyKey === idemKey &&
      b.firstResult &&
      Array.isArray(b.firstResult.actions)
  );
  if (existing) {
    const result: MergeResult = {
      ...existing.firstResult,
      idempotentHit: true,
      actions: existing.firstResult.actions.map((a) => ({ ...a })),
    };
    return { db, result, batch: existing };
  }

  // 查找或新建批次
  let batch: Batch;
  let progress: MergeProgress;
  if (resume) {
    const existBatch = db.batches.find(
      (b) => b.idempotencyKey === idemKey && b.status !== "archived"
    );
    if (existBatch) {
      batch = existBatch;
      progress =
        db.mergeProgress.find((p) => p.batchId === batch.id) ??
        newProgress(batch.id);
    } else {
      batch = newBatch(meta, idemKey, incoming.length);
      progress = newProgress(batch.id);
      db.batches.push(batch);
      db.mergeProgress.push(progress);
    }
  } else {
    batch = newBatch(meta, idemKey, incoming.length);
    progress = newProgress(batch.id);
    db.batches.push(batch);
    db.mergeProgress.push(progress);
  }

  const actions: MergeResult["actions"] = [];
  let inserted = 0;
  let updated = 0;
  let conflicts = 0;
  let unchanged = 0;
  let interrupted = false;

  const startIndex = resume ? progress.lastCheckpoint : 0;

  for (let i = startIndex; i < incoming.length; i++) {
    const item = incoming[i];
    const confirmed = progress.confirmedIndexes.includes(i);

    try {
      if (!confirmed) {
        // —— 规则 3：保存失败模拟。在处理第 i 条前触发，确保检查点停在 i ——
        if (failureSim.enabled && failureSim.failAt > 0 && i >= failureSim.failAt) {
          throw new Error("模拟保存失败");
        }

        const outcome = mergeOneComponent(db, item, batch.id);
        actions.push(outcome.action);
        if (outcome.action.action === "inserted") inserted++;
        else if (outcome.action.action === "updated") updated++;
        else if (outcome.action.action === "conflict") conflicts++;
        else unchanged++;

        // 记录已确认的构件
        progress.confirmedIndexes.push(i);
        if (outcome.componentId) {
          progress.confirmedComponentIds.push(outcome.componentId);
        }
        progress.lastCheckpoint = i + 1;
        progress.updatedAt = new Date().toISOString();

        // 每个构件确认后落检查点，保存失败可从这里恢复
        saveDatabase(db);
      }
    } catch (err) {
      // 保存失败：中断，保留检查点，等待续传
      interrupted = true;
      actions.push({
        componentNo: item.componentNo,
        action: "unchanged",
        detail: `保存失败，已恢复到检查点（第 ${progress.lastCheckpoint} 条）：${
          err instanceof Error ? err.message : "未知错误"
        }`,
      });
      break;
    }
  }

  // 批次状态
  const done = progress.lastCheckpoint >= incoming.length && !interrupted;
  batch.status = done ? "confirmed" : "draft";
  if (!meta.batchNo) {
    // 规则 5：没有批次号的老草稿按测量日期归档
    batch.status = "archived";
  }

  const result: MergeResult = {
    batchId: batch.id,
    processedAt: new Date().toISOString(),
    total: incoming.length,
    inserted,
    updated,
    conflicts,
    unchanged,
    checkpoint: progress.lastCheckpoint,
    interrupted,
    idempotentHit: false,
    actions,
  };

  // 只有完整完成才固化第一次结果（幂等）；中断时不固化，续传后再固化
  if (done) {
    batch.firstResult = result;
  }
  saveDatabase(db);

  return { db, result, batch };
}

function newBatch(
  meta: { batchNo: string | null; buildingName: string; measurementDate: string },
  idemKey: string,
  count: number
): Batch {
  return {
    id: uid("batch"),
    batchNo: meta.batchNo,
    idempotencyKey: idemKey,
    buildingName: meta.buildingName,
    measurementDate: meta.measurementDate,
    status: meta.batchNo ? "confirmed" : "archived",
    componentCount: count,
    uploadedAt: new Date().toISOString(),
    firstResult: {} as MergeResult,
  };
}

function newProgress(batchId: string): MergeProgress {
  return {
    batchId,
    confirmedIndexes: [],
    confirmedComponentIds: [],
    lastCheckpoint: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** 合并单个构件，返回动作与落库构件 ID */
function mergeOneComponent(
  db: Database,
  item: Component,
  batchId: string
): { action: MergeResult["actions"][number]; componentId: string | null } {
  const current = findActiveComponent(db, item.buildingName, item.componentNo);

  // 无当前版本：新增
  if (!current) {
    const comp: Component = {
      ...item,
      id: uid("comp"),
      version: 1,
      basedOnVersion: null,
      status: "active",
      replacedBy: null,
      batchId,
      updatedAt: new Date().toISOString(),
    };
    db.components.push(comp);
    return {
      action: {
        componentNo: item.componentNo,
        action: "inserted",
        detail: `新增构件，版本 v1`,
      },
      componentId: comp.id,
    };
  }

  // 有当前版本：判断是否并发修改
  const incomingChanged = fingerprint(item) !== fingerprint(current);
  if (!incomingChanged) {
    return {
      action: {
        componentNo: item.componentNo,
        action: "unchanged",
        detail: "与当前版本一致，无变化",
      },
      componentId: current.id,
    };
  }

  // 规则 1：并发判定。
  //  - 传入是原始版本（basedOnVersion 为 null）却已存在当前版本 → 两份原始记录，冲突；
  //  - 传入基于旧版本（basedOnVersion < 当前 version）→ 两边都改过同一祖先，冲突。
  // 两种情况都保留两份待确认，后到不覆盖。
  const isConflict =
    item.basedOnVersion == null ||
    (item.basedOnVersion != null && item.basedOnVersion < current.version);

  if (isConflict) {
    const conflict: ConflictRecord = {
      id: uid("conf"),
      componentNo: item.componentNo,
      buildingName: item.buildingName,
      baseVersion: Math.min(item.basedOnVersion ?? 0, current.version),
      sideA: { ...current },
      sideB: {
        ...item,
        id: uid("comp"),
        version: current.version + 1,
        basedOnVersion: current.version,
        status: "active",
        replacedBy: null,
        batchId,
        updatedAt: new Date().toISOString(),
      },
      status: "pending",
      resolution: null,
      resolvedComponentId: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    db.conflicts.push(conflict);
    return {
      action: {
        componentNo: item.componentNo,
        action: "conflict",
        detail: `两边都修改过（基于 v${item.basedOnVersion}，当前 v${current.version}），保留两份待确认`,
      },
      componentId: null,
    };
  }

  // 干净更新：传入版本基于当前版本 → 新版本替代，旧版本保留可查
  const newComp: Component = {
    ...item,
    id: uid("comp"),
    version: current.version + 1,
    basedOnVersion: current.version,
    status: "active",
    replacedBy: null,
    batchId,
    updatedAt: new Date().toISOString(),
  };
  current.status = "superseded";
  current.replacedBy = newComp.id;
  db.components.push(newComp);

  // 规则 2：尺寸一变，引用它的关系边与修缮结论立即失效
  invalidateDependents(db, current, newComp);

  return {
    action: {
      componentNo: item.componentNo,
      action: "updated",
      detail: `基于 v${current.version} 干净更新 → v${newComp.version}，旧版本保留`,
    },
    componentId: newComp.id,
  };
}

/** 规则 2：构件更换后尺寸一变，引用它的关系边和修缮结论立即失效，旧成果仍可查 */
function invalidateDependents(
  db: Database,
  oldComp: Component,
  newComp: Component
): void {
  const dimensionChanged = oldComp.sectionSize !== newComp.sectionSize;
  if (!dimensionChanged) return;

  const reason = `构件 ${oldComp.componentNo} 截面尺寸由 ${oldComp.sectionSize} 变更为 ${newComp.sectionSize}，引用需重算`;

  for (const edge of db.relationEdges) {
    if (edge.status !== "valid") continue;
    const refs =
      (edge.fromComponentNo === oldComp.componentNo &&
        edge.fromComponentVersion === oldComp.version) ||
      (edge.toComponentNo === oldComp.componentNo &&
        edge.toComponentVersion === oldComp.version);
    if (refs) {
      edge.status = "stale";
      edge.staleReason = reason;
    }
  }

  for (const conclusion of db.repairConclusions) {
    if (conclusion.status !== "valid") continue;
    if (
      conclusion.componentNo === oldComp.componentNo &&
      conclusion.componentVersion === oldComp.version
    ) {
      conclusion.status = "stale";
      conclusion.staleReason = reason;
    }
  }
}

/** 解决冲突：保留 A 或 B，另一份标记为 superseded */
export function resolveConflict(
  db: Database,
  conflictId: string,
  keep: "keepA" | "keepB"
): { db: Database; conflict: ConflictRecord } {
  const conflict = db.conflicts.find((c) => c.id === conflictId);
  if (!conflict || conflict.status !== "pending") {
    return { db, conflict: conflict! };
  }

  if (keep === "keepA") {
    // 保留当前版本 A，B 标记为 superseded
    conflict.sideB.status = "superseded";
    conflict.sideB.replacedBy = conflict.sideA.id;
    conflict.resolvedComponentId = conflict.sideA.id;
  } else {
    // 保留 B：A 标记为 superseded，B 生效
    conflict.sideA.status = "superseded";
    conflict.sideA.replacedBy = conflict.sideB.id;
    conflict.resolvedComponentId = conflict.sideB.id;
    // 确保 B 在构件库里
    if (!db.components.find((c) => c.id === conflict.sideB.id)) {
      db.components.push(conflict.sideB);
    }
  }

  conflict.status = "resolved";
  conflict.resolution = keep;
  conflict.resolvedAt = new Date().toISOString();
  saveDatabase(db);
  return { db, conflict };
}

/** 重算失效的关系边与修缮结论（基于当前生效构件） */
export function recalculateStale(db: Database): {
  db: Database;
  edges: number;
  conclusions: number;
} {
  let edges = 0;
  let conclusions = 0;

  for (const edge of db.relationEdges) {
    if (edge.status !== "stale") continue;
    const from = findActiveComponent(db, edge.buildingName, edge.fromComponentNo);
    const to = findActiveComponent(db, edge.buildingName, edge.toComponentNo);
    if (from && to) {
      edge.fromComponentVersion = from.version;
      edge.toComponentVersion = to.version;
      edge.status = "valid";
      edge.staleReason = null;
      edge.recalculatedAt = new Date().toISOString();
      edges++;
    }
  }

  for (const conclusion of db.repairConclusions) {
    if (conclusion.status !== "stale") continue;
    const comp = findActiveComponent(
      db,
      conclusion.buildingName,
      conclusion.componentNo
    );
    if (comp) {
      conclusion.componentVersion = comp.version;
      conclusion.status = "valid";
      conclusion.staleReason = null;
      conclusion.recalculatedAt = new Date().toISOString();
      conclusions++;
    }
  }

  saveDatabase(db);
  return { db, edges, conclusions };
}

/** 添加一条关系边（引用当前构件版本） */
export function addRelationEdge(
  db: Database,
  edge: Omit<RelationEdge, "id" | "status" | "staleReason" | "createdAt" | "recalculatedAt">
): RelationEdge {
  const full: RelationEdge = {
    ...edge,
    id: uid("edge"),
    status: "valid",
    staleReason: null,
    createdAt: new Date().toISOString(),
    recalculatedAt: null,
  };
  db.relationEdges.push(full);
  saveDatabase(db);
  return full;
}

/** 添加一条修缮结论（引用当前构件版本） */
export function addRepairConclusion(
  db: Database,
  conclusion: Omit<
    RepairConclusion,
    "id" | "status" | "staleReason" | "createdAt" | "recalculatedAt"
  >
): RepairConclusion {
  const full: RepairConclusion = {
    ...conclusion,
    id: uid("conc"),
    status: "valid",
    staleReason: null,
    createdAt: new Date().toISOString(),
    recalculatedAt: null,
  };
  db.repairConclusions.push(full);
  saveDatabase(db);
  return full;
}
