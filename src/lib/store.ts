// 应用状态：以数据库为核心，订阅式更新
import { useSyncExternalStore } from "react";
import type { Database } from "../types";
import { loadDatabase, saveDatabase, clearDatabase } from "./db";
import { buildSeedDatabase } from "./seed";
import {
  mergeBatch as mergeBatchEngine,
  resolveConflict as resolveConflictEngine,
  recalculateStale as recalculateStaleEngine,
  failureSim,
} from "./merge";
import type { Component } from "../types";

let db: Database = loadDatabase();
const listeners = new Set<() => void>();

function emitChange() {
  db = loadDatabase();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Database {
  return db;
}

/** React Hook：订阅数据库 */
export function useDatabase(): Database {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 初始化演示数据 */
export function seedIfEmpty() {
  if (!db.meta.seeded && db.components.length === 0) {
    buildSeedDatabase();
    db = loadDatabase();
    emitChange();
  }
}

/** 重置为演示数据 */
export function resetToSeed() {
  clearDatabase();
  buildSeedDatabase();
  db = loadDatabase();
  emitChange();
}

/** 清空全部 */
export function clearAll() {
  clearDatabase();
  db = loadDatabase();
  emitChange();
}

/** 合并一批构件 */
export function mergeBatch(
  incoming: Component[],
  meta: { batchNo: string | null; buildingName: string; measurementDate: string },
  resume = false
) {
  const result = mergeBatchEngine(db, incoming, meta, resume);
  db = loadDatabase();
  emitChange();
  return result;
}

/** 解决冲突 */
export function resolveConflict(conflictId: string, keep: "keepA" | "keepB") {
  const result = resolveConflictEngine(db, conflictId, keep);
  db = loadDatabase();
  emitChange();
  return result;
}

/** 重算失效的关系边与修缮结论 */
export function recalculateStale() {
  const result = recalculateStaleEngine(db);
  db = loadDatabase();
  emitChange();
  return result;
}

/** 设置保存失败模拟 */
export function setFailureSim(enabled: boolean, failAt = 0) {
  failureSim.enabled = enabled;
  failureSim.failAt = failAt;
}

export { saveDatabase };
