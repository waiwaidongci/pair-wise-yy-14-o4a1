// 测绘批次合并内核 —— 领域模型
// 四类测绘成果：构件清单 / 尺寸台账 / 病害落点图 / 建筑关系

export type MemberType = "component" | "dimension" | "defect" | "relation";

/** 所有构件关系 / 病害都引用构件编号 */
export interface ComponentRec {
  id: string;            // 构件编号
  building: string;      // 所属建筑
  name: string;          // 构件名称
  wood: string;          // 木材种类
  mortise: string;       // 榫卯类型
  section: string;       // 截面尺寸，如 180×240
  replaced?: boolean;    // 是否为更换后的新件
  note?: string;
  measuredAt: string;    // 测量日期
}

export interface DimensionRec {
  id: string;
  componentId: string;
  section: string;
  length: number;        // 长度 mm
  note?: string;
  measuredAt: string;
}

export interface DefectRec {
  id: string;
  componentId: string;
  kind: string;          // 开裂 / 糟朽 / 变形
  x: number;             // 落点图坐标（百分比 0-100）
  y: number;
  severity: "轻" | "中" | "重";
  advice: string;        // 修缮建议（派生结论）
  measuredAt: string;
}

export interface RelationRec {
  id: string;
  building: string;
  from: string;          // 关系起点构件编号
  to: string;            // 关系终点构件编号
  kind: string;          // 榫接 / 承托 / 墩接
  note?: string;
  measuredAt: string;
}

export type DomainRec = ComponentRec | DimensionRec | DefectRec | RelationRec;

/** 离线记录：data 是测量内容，baseRev 是离站时站上该记录的版本，0 表示当时尚不存在 */
export interface Member<T> {
  data: T;
  baseRev: number;
}

export interface Payload {
  batchId?: string;                 // 老草稿没有批次号
  team: string;
  measuredAt: string;
  components: Member<ComponentRec>[];
  dimensions: Member<DimensionRec>[];
  defects: Member<DefectRec>[];
  relations: Member<RelationRec>[];
}

/** 一份等待人工确认的异本 */
export interface Candidate<T> {
  id: string;
  by: string;
  at: string;
  data: T;
  baseRev: number;
}

export interface HistoryEntry<T> {
  rev: number;
  data: T;
  by: string;
  at: string;
  reason: string;
}

export type EntryStatus = "active" | "conflict" | "invalid";

export interface CanonicalEntry<T> {
  id: string;
  type: MemberType;
  data: T;
  rev: number;
  status: EntryStatus;
  invalidReason?: string;
  updatedBy: string;
  updatedAt: string;
  candidates: Candidate<T>[];      // 待确认的另一份（或多份）
  history: HistoryEntry<T>[];      // 旧成果全部可查
}

export type MemberRef = string;    // `${type}:${id}`

export const ref = (type: MemberType, id: string): MemberRef => `${type}:${id}`;

export interface ArrivalResult {
  team: string;
  payloadHash: string;
  status: "applied" | "partial" | "duplicate" | "rejected";
  message: string;
  applied: MemberRef[];
  conflicts: MemberRef[];
  invalidated: MemberRef[];
  recomputed: MemberRef[];
  checkpointAfter?: string | null;
  at: string;
}

export type BatchStatus = "open" | "partial" | "received" | "confirmed";

export interface PartialTransmission {
  payload: Payload;
  appliedMembers: MemberRef[];
  afterComponentId: string | null;
  at: string;
}

export interface BatchState {
  batchId: string;
  building: string;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  arrivals: Record<string, ArrivalResult>;  // 按队幂等：只认第一次
  firstHashes: Record<string, string>;
  /** 各队未落盘完成的断点（按队隔离，互不覆盖） */
  partials: Record<string, PartialTransmission>;
}

export interface ArchiveGroup {
  date: string;                    // 测量日期
  drafts: { team: string; payload: Payload; archivedAt: string }[];
}

export interface LogEntry {
  at: string;
  level: "info" | "warn" | "error" | "ok";
  text: string;
}

export interface State {
  building: string;
  components: Record<string, CanonicalEntry<ComponentRec>>;
  dimensions: Record<string, CanonicalEntry<DimensionRec>>;
  defects: Record<string, CanonicalEntry<DefectRec>>;
  relations: Record<string, CanonicalEntry<RelationRec>>;
  batches: Record<string, BatchState>;
  archives: ArchiveGroup[];
  log: LogEntry[];
}
