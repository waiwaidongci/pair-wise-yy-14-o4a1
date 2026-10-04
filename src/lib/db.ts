// 本地存储层：以 localStorage 为"数据库"，提供带检查点的事务式写入
import type { Database } from "../types";

const STORAGE_KEY = "gujian-survey-db-v1";

/** 空数据库 */
export function emptyDatabase(): Database {
  return {
    components: [],
    relationEdges: [],
    repairConclusions: [],
    conflicts: [],
    batches: [],
    mergeProgress: [],
    meta: { version: 1, seeded: false },
  };
}

/** 读取数据库 */
export function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();
    const parsed = JSON.parse(raw) as Database;
    // 兜底补齐字段，避免旧草稿缺字段
    return { ...emptyDatabase(), ...parsed, meta: { version: 1, seeded: false },
      components: parsed.components ?? [],
      relationEdges: parsed.relationEdges ?? [],
      repairConclusions: parsed.repairConclusions ?? [],
      conflicts: parsed.conflicts ?? [],
      batches: parsed.batches ?? [],
      mergeProgress: parsed.mergeProgress ?? [] };
  } catch {
    return emptyDatabase();
  }
}

/** 写入数据库（整体提交） */
export function saveDatabase(db: Database): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    // 保存失败：抛出由合并引擎捕获，走断点续传
    throw new Error(
      `保存失败：${err instanceof Error ? err.message : "localStorage 写入异常"}`
    );
  }
}

/** 清空数据库 */
export function clearDatabase(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** 生成唯一 ID */
export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
