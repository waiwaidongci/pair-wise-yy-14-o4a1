// 古建木结构榫卯构件测绘 —— 核心数据类型

/** 构件状态：active 当前生效版本；superseded 已被新版本替代（旧成果仍可查） */
export type ComponentStatus = "active" | "superseded";

/** 构件：一份构件清单的最小单元，带版本与来源批次 */
export interface Component {
  id: string; // 内部唯一 ID
  componentNo: string; // 构件编号（业务键，如 梁架A-03）
  buildingName: string; // 建筑名称
  timberType: string; // 木材种类
  tenonType: string; // 榫卯类型
  sectionSize: string; // 截面尺寸（如 180x240mm）
  diseaseLocation: string; // 病害位置
  deformation: string; // 变形情况
  repairSuggestion: string; // 修缮建议
  version: number; // 版本号（从 1 递增）
  basedOnVersion: number | null; // 本次修改所基于的版本（用于并发判定）
  status: ComponentStatus;
  replacedBy: string | null; // 被哪个构件 ID 替代
  batchId: string | null; // 来源批次
  measurementDate: string; // 测量日期 YYYY-MM-DD
  updatedAt: string; // 最近更新时间 ISO
}

/** 关系边：引用构件版本，尺寸一变即失效 */
export interface RelationEdge {
  id: string;
  buildingName: string;
  fromComponentNo: string;
  toComponentNo: string;
  relationType: string; // 搭接 / 榫接 / 并列 …
  fromComponentVersion: number; // 引用的 from 构件版本
  toComponentVersion: number; // 引用的 to 构件版本
  status: "valid" | "stale";
  staleReason: string | null;
  createdAt: string;
  recalculatedAt: string | null;
}

/** 修缮结论：由构件数据推导，引用构件版本，失效后需重算 */
export interface RepairConclusion {
  id: string;
  buildingName: string;
  componentNo: string;
  componentVersion: number;
  conclusion: string;
  status: "valid" | "stale";
  staleReason: string | null;
  createdAt: string;
  recalculatedAt: string | null;
}

/** 冲突记录：同一构件两边都改过时保留两份待确认 */
export interface ConflictRecord {
  id: string;
  componentNo: string;
  buildingName: string;
  baseVersion: number; // 共同祖先版本
  sideA: Component; // 先到（库里的当前版本）
  sideB: Component; // 后到（本次上传的版本）
  status: "pending" | "resolved";
  resolution: "keepA" | "keepB" | null;
  resolvedComponentId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** 批次：一次上传的测绘数据，幂等键保证重传只认第一次 */
export interface Batch {
  id: string;
  batchNo: string | null; // 批次号；老草稿可能为空
  idempotencyKey: string; // 幂等键：batchNo 或 draft:日期:建筑
  buildingName: string;
  measurementDate: string;
  status: "draft" | "confirmed" | "archived";
  componentCount: number;
  uploadedAt: string; // 首次上传时间
  firstResult: MergeResult; // 第一次的合并结果（重传直接返回）
}

/** 单条构件的合并动作 */
export type MergeAction =
  | "inserted" // 新增
  | "updated" // 干净更新（基于当前版本）
  | "conflict" // 并发冲突，保留两份
  | "unchanged"; // 无变化

/** 合并结果 */
export interface MergeResult {
  batchId: string;
  processedAt: string;
  total: number;
  inserted: number;
  updated: number;
  conflicts: number;
  unchanged: number;
  /** 保存失败时的断点：已确认到第几条（从 0 起） */
  checkpoint: number;
  /** 是否因保存失败而中断 */
  interrupted: boolean;
  /** 幂等命中：重传时为 true，直接返回第一次结果 */
  idempotentHit: boolean;
  actions: Array<{
    componentNo: string;
    action: MergeAction;
    detail: string;
  }>;
}

/** 合并进度（持久化，用于断点续传） */
export interface MergeProgress {
  batchId: string;
  /** 已确认的构件下标集合 */
  confirmedIndexes: number[];
  /** 已落库的构件 ID（去重） */
  confirmedComponentIds: string[];
  lastCheckpoint: number;
  updatedAt: string;
}

/** 数据库整体结构 */
export interface Database {
  components: Component[];
  relationEdges: RelationEdge[];
  repairConclusions: RepairConclusion[];
  conflicts: ConflictRecord[];
  batches: Batch[];
  mergeProgress: MergeProgress[];
  meta: {
    version: number;
    seeded: boolean;
  };
}
