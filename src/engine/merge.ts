// 测绘批次合并内核：三方版本检测 + 冲突双留 + 级联失效重算 + 断点续传 + 幂等
import {
  ArchiveGroup,
  BatchState,
  CanonicalEntry,
  Candidate,
  ComponentRec,
  DefectRec,
  DimensionRec,
  EntryStatus,
  HistoryEntry,
  LogEntry,
  Member,
  MemberRef,
  MemberType,
  Payload,
  RelationRec,
  State,
  ref,
} from "./types";

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const deepEqual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const hash = (p: Payload): string => {
  const s = JSON.stringify([p.team, p.components, p.dimensions, p.defects, p.relations]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(16);
};

// ---------- 通用台账操作 ----------

type Table<T> = Record<string, CanonicalEntry<T>>;

function freshEntry<T>(type: MemberType, id: string, data: T, by: string, at: string): CanonicalEntry<T> {
  return {
    id,
    type,
    data,
    rev: 1,
    status: "active",
    updatedBy: by,
    updatedAt: at,
    candidates: [],
    history: [],
  };
}

function pushHistory<T>(entry: CanonicalEntry<T>, by: string, at: string, reason: string): void {
  const h: HistoryEntry<T> = { rev: entry.rev, data: clone(entry.data), by, at, reason };
  entry.history.push(h);
}

/**
 * 三方合并一条记录：
 * - 站上无此记录 / baseRev === 当前 rev（对方基于最新值）→ 接受晚到记录
 * - baseRev < 当前 rev 且内容与站上不同（双方都改过同一基线）→ 双方都改：保留两份待确认，绝不覆盖
 * - 内容相同 → 幂等无操作
 */
function mergeMember<T extends { id: string }>(
  table: Table<T>,
  type: MemberType,
  m: Member<T>,
  team: string,
  at: string,
  log: LogEntry[]
): "applied" | "conflict" | "noop" {
  const cur = table[m.data.id];
  if (!cur) {
    table[m.data.id] = freshEntry(type, m.data.id, clone(m.data), team, at);
    return "applied";
  }
  if (deepEqual(cur.data, m.data)) return "noop";

  const basedOnLatest = m.baseRev === cur.rev;
  const basedOnOlder = m.baseRev < cur.rev;
  if (basedOnOlder) {
    // 晚到的一方和站上都相对同一基线改过：不覆盖，追加为待确认异本
    const already = cur.candidates.some((c) => c.by === team && deepEqual(c.data, m.data));
    if (!already) {
      const cand: Candidate<T> = {
        id: cur.id,
        by: team,
        at,
        data: clone(m.data),
        baseRev: m.baseRev,
      };
      cur.candidates.push(cand);
      cur.status = "conflict";
      log.push({
        at,
        level: "warn",
        text: `冲突保留：${ref(type, cur.id)} 站上版本 r${cur.rev} 与 ${team} 基于 r${m.baseRev} 的修改并存，等待人工确认`,
      });
    }
    return "conflict";
  }
  if (basedOnLatest || (m.baseRev > cur.rev)) {
    pushHistory(cur, cur.updatedBy, cur.updatedAt, "被新版本取代前留档");
    cur.data = clone(m.data);
    cur.rev += 1;
    cur.updatedBy = team;
    cur.updatedAt = at;
    cur.status = cur.candidates.length > 0 ? "conflict" : "active";
    return "applied";
  }
  return "noop";
}

// ---------- 修缮结论（派生） ----------

export function computeAdvice(d: Omit<DefectRec, "advice">, comp?: ComponentRec): string {
  const where = `${d.kind}（${d.severity}度）`;
  if (comp?.replaced) return `构件已更换，原${where}随旧件剔除，新件跟踪观察`;
  if (d.kind.includes("糟朽")) return d.severity === "重" ? "墩接或更换，先做防腐处理" : "局部剔补防腐，继续监测";
  if (d.kind.includes("开裂")) return d.severity === "重" ? "裂缝注胶加箍，纳入修缮计划" : "端部嵌补，周期复查";
  if (d.kind.includes("变形")) return "校正支顶并复测榫卯间隙";
  return "现场复核后确定";
}

// ---------- 级联失效：构件更换 / 截面变更 ----------

interface Cascade {
  invalidated: MemberRef[];
  recomputed: MemberRef[];
}

/**
 * 构件一换 / 截面一变：
 * - 引用它的关系边立即失效（旧边留档 history，状态 invalid，等待重算）
 * - 它身上的病害修缮结论立即按新件重算（旧结论留档）
 */
function cascadeComponentChange(
  state: State,
  comp: CanonicalEntry<ComponentRec>,
  at: string
): Cascade {
  const out: Cascade = { invalidated: [], recomputed: [] };
  const cid = comp.id;

  for (const e of Object.values(state.relations)) {
    const d = e.data;
    const touches = d.from === cid || d.to === cid;
    if (!touches) continue;
    if (e.status !== "invalid") {
      pushHistory(e, e.updatedBy, e.updatedAt, `构件 ${cid} 更换/截面变更，关系边自动失效待重算`);
      e.status = "invalid";
      e.invalidReason = `引用构件 ${cid} 已更换或截面变更（${comp.data.section}）`;
      out.invalidated.push(ref("relation", e.id));
    }
  }

  for (const e of Object.values(state.defects)) {
    if (e.data.componentId !== cid) continue;
    const oldAdvice = e.data.advice;
    const newAdvice = computeAdvice(e.data, comp.data);
    if (oldAdvice !== newAdvice) {
      pushHistory(e, e.updatedBy, e.updatedAt, `构件 ${cid} 变更，旧修缮结论「${oldAdvice}」失效留档`);
      e.data = { ...e.data, advice: newAdvice };
      e.rev += 1;
      e.updatedBy = "系统";
      e.updatedAt = at;
      out.recomputed.push(ref("defect", e.id));
    }
  }
  return out;
}

/** 人工重算失效关系边：依据当前构件核对引用，给出重算结论 */
export function recomputeRelation(
  state: State,
  relationId: string,
  at: string,
  verdict: "reaffirm" | "rebuilt" | "retired"
): State {
  const next = clone(state);
  const e = next.relations[relationId];
  if (!e || e.status !== "invalid") return next;
  const from = next.components[e.data.from];
  const to = next.components[e.data.to];
  pushHistory(e, e.updatedBy, e.updatedAt, `重算前留档：${e.invalidReason ?? ""}`);
  if (verdict === "retired") {
    e.status = "invalid";
    e.invalidReason = "重算确认：旧件关系不再存在，旧成果归档";
  } else if (!from || !to) {
    e.status = "invalid";
    e.invalidReason = "重算失败：端点构件缺失";
  } else {
    const rebuiltNote =
      verdict === "rebuilt"
        ? `（依新件重接 ${from.data.name}↔${to.data.name}，截面 ${from.data.section}/${to.data.section}）`
        : "（两端构件复核后维持原关系）";
    e.data = { ...e.data, note: `${e.data.note ?? ""}${rebuiltNote}` };
    e.status = "active";
    delete e.invalidReason;
    e.updatedBy = "测绘员";
    e.updatedAt = at;
  }
  e.rev += 1;
  next.log.push({ at, level: "ok", text: `关系边 ${relationId} 完成重算（${verdict}）` });
  return next;
}

// ---------- 无批次号老草稿归档 ----------

export function archiveDraft(state: State, p: Payload, at: string): State {
  const next = clone(state);
  const date = p.measuredAt.slice(0, 10);
  let group = next.archives.find((g) => g.date === date);
  if (!group) {
    group = { date, drafts: [] } as ArchiveGroup;
    next.archives.push(group);
  }
  group.drafts.push({ team: p.team, payload: clone(p), archivedAt: at });
  next.log.push({
    at,
    level: "info",
    text: `无批次号草稿（${p.team}，测量日 ${date}）按测量日期归档，不并入主数据`,
  });
  next.archives.sort((a, b) => (a.date < b.date ? 1 : -1));
  return next;
}

// ---------- 批次接收（断点续传 + 幂等） ----------

export interface ReceiveOptions {
  /** 持久化回调，按构件组提交；抛出异常模拟保存失败 */
  persist?: (snapshot: State, afterComponentId: string | null) => void;
  at?: () => string;
}

const COLLECTIONS: { key: keyof Pick<Payload, "components" | "dimensions" | "defects" | "relations">; type: MemberType }[] = [
  { key: "components", type: "component" },
  { key: "dimensions", type: "dimension" },
  { key: "defects", type: "defect" },
  { key: "relations", type: "relation" },
];

/**
 * 构件组：以载荷中出现的构件编号为故障恢复事务边界。
 * 归属规则只看本载荷自己携带的成员；关系边归入其 from 构件组，
 * 组顺序按构件编号稳定排序，跨队对同一构件的修改落在同名组上。
 */
function componentGroups(p: Payload): string[] {
  const ids = new Set<string>();
  p.components.forEach((m) => ids.add(m.data.id));
  p.dimensions.forEach((m) => ids.add(m.data.componentId));
  p.defects.forEach((m) => ids.add(m.data.componentId));
  p.relations.forEach((m) => ids.add(m.data.from));
  return [...ids].sort();
}

function membersOfGroup(p: Payload, cid: string) {
  return {
    components: p.components.filter((m) => m.data.id === cid),
    dimensions: p.dimensions.filter((m) => m.data.componentId === cid),
    defects: p.defects.filter((m) => m.data.componentId === cid),
    relations: p.relations.filter((m) => m.data.from === cid),
  };
}

/** 组内是否真的携带了该构件本身（用于把检查点语义限定为"最后确认的构件"） */
function groupTouchesComponent(p: Payload, cid: string): boolean {
  return (
    p.components.some((m) => m.data.id === cid) ||
    p.dimensions.some((m) => m.data.componentId === cid) ||
    p.defects.some((m) => m.data.componentId === cid) ||
    p.relations.some((m) => m.data.from === cid)
  );
}

/**
 * 接收一个测绘队的到站上载。
 * 规则：
 * - 重传同一批次同一队：返回第一次的处理结果（duplicate），不再改动数据
 * - 按构件组顺序落盘；某组保存失败 → 已确认组保留，检查点停住，状态 partial，可续传
 */
export function receiveArrival(prev: State, payload: Payload, opts: ReceiveOptions = {}): {
  state: State;
  result: import("./types").ArrivalResult;
} {
  const at = opts.at ? opts.at() : new Date().toISOString();

  // 无批次号 → 归档，不并入
  if (!payload.batchId) {
    const state = archiveDraft(prev, payload, at);
    const result: import("./types").ArrivalResult = {
      team: payload.team,
      payloadHash: hash(payload),
      status: "rejected",
      message: "无批次号，已按测量日期归档",
      applied: [],
      conflicts: [],
      invalidated: [],
      recomputed: [],
      checkpointAfter: null,
      at,
    };
    return { state, result };
  }

  const state = clone(prev);
  const batchId = payload.batchId!;
  let batch: BatchState | undefined = state.batches[batchId];
  if (!batch) {
    const building = payload.components[0]?.data.building ?? state.building;
    batch = {
      batchId,
      building,
      status: "open",
      createdAt: at,
      updatedAt: at,
      arrivals: {},
      firstHashes: {},
      partials: {},
    };
    state.batches[batchId] = batch;
  }

  const h = hash(payload);
  const first = batch.arrivals[payload.team];
  // 该队已有"完成"的到站记录 → 重传幂等忽略（内容不同也不落库）；partial 不在这里拦截
  if (first && first.status !== "partial") {
    const result: import("./types").ArrivalResult = {
      ...first,
      status: "duplicate",
      message: `同一批次重传被忽略：只认第一次结果（原结论 ${first.message}，校验 ${first.payloadHash}）`,
      at,
    };
    state.log.push({ at, level: "info", text: `${payload.team} 重传批次 ${batchId}：幂等忽略，重传内容不落库` });
    batch.updatedAt = at;
    return { state, result };
  }

  // 只有本队存在断点时才沿用"首次暂存载荷"；别的队到站或无断点都用本次载荷，
  // 这样重传里夹带的伪造记录（如 FAKE-99）永远不会入库
  const partial = batch.partials[payload.team];
  const isResume = !!partial;
  const effective: Payload = isResume ? partial!.payload : payload;
  const effectiveHash = batch.firstHashes[effective.team] ?? h;
  batch.firstHashes[effective.team] = effectiveHash;

  // 统计字段只反映"本次调用"新处理的成员；历史结论仍保留在 arrivals[首次] 中可查
  const result: import("./types").ArrivalResult = {
    team: effective.team,
    payloadHash: effectiveHash,
    status: "applied",
    message: "",
    applied: [],
    conflicts: [],
    invalidated: [],
    recomputed: [],
    checkpointAfter: partial?.afterComponentId ?? first?.checkpointAfter ?? null,
    at,
  };

  // 成员级游标只以"真正落盘成功"的成员为准（partial.appliedMembers）；
  // 不能拿首次结果的 applied/conflicts 兜底——那里面可能包含随后回滚组的成员，
  // 否则续传会把回滚组误判成已处理而跳过
  const done = new Set<MemberRef>(partial?.appliedMembers ?? []);

  interface Unit {
    cid: string;
    type: MemberType;
    member: Member<any>;
  }
  const groupIds = componentGroups(effective);
  const unitsByGroup: Record<string, Unit[]> = {};
  for (const cid of groupIds) {
    const grp = membersOfGroup(effective, cid);
    const units: Unit[] = [];
    for (const col of COLLECTIONS) {
      for (const member of grp[col.key] as Member<any>[]) {
        units.push({ cid, type: col.type, member });
      }
    }
    unitsByGroup[cid] = units;
  }

  let failedAt: string | null = null;
  const appliedMembers: MemberRef[] = [...(partial?.appliedMembers ?? [])];

  for (const cid of groupIds) {
    const units = unitsByGroup[cid].filter((u) => !done.has(ref(u.type, u.member.data.id)));
    if (units.length === 0) continue;

    // 构件组事务：先在暂存上应用整组，再持久化；持久化抛错则整组回滚
    const staging = clone(state);
    const touchedComponent = staging.components[cid];
    const beforeReplaced = touchedComponent?.data.replaced ?? false;
    const beforeSection = touchedComponent?.data.section;

    for (const u of units) {
      const table = (staging as any)[u.type + "s"] as Table<any>;
      const r = mergeMember(table, u.type, u.member, effective.team, at, staging.log);
      const rref = ref(u.type, u.member.data.id);
      if (r === "applied" && !result.applied.includes(rref)) result.applied.push(rref);
      else if (r === "conflict" && !result.conflicts.includes(rref)) result.conflicts.push(rref);
    }

    // 组内构件发生更换 / 截面变化 → 级联失效与重算
    const afterComp = staging.components[cid];
    if (afterComp && groupTouchesComponent(effective, cid)) {
      const sectionChanged = beforeSection !== undefined && beforeSection !== afterComp.data.section;
      if ((afterComp.data.replaced && !beforeReplaced) || sectionChanged) {
        const cas = cascadeComponentChange(staging, afterComp, at);
        cas.invalidated.forEach((x) => !result.invalidated.includes(x) && result.invalidated.push(x));
        cas.recomputed.forEach((x) => !result.recomputed.includes(x) && result.recomputed.push(x));
      }
    }

    try {
      opts.persist?.(staging, cid);
    } catch (err) {
      failedAt = cid;
      state.log.push({
        at,
        level: "error",
        text: `保存失败于构件组 ${cid}：${(err as Error).message}；该组回滚，检查点停在「${result.checkpointAfter ?? "起点"}」，可断点续传`,
      });
      break;
    }

    // 提交暂存
    state.components = staging.components;
    state.dimensions = staging.dimensions;
    state.defects = staging.defects;
    state.relations = staging.relations;
    state.log = staging.log;
    units.forEach((u) => {
      const rref = ref(u.type, u.member.data.id);
      done.add(rref);
      if (!appliedMembers.includes(rref)) appliedMembers.push(rref);
    });
    result.checkpointAfter = cid;
  }

  if (failedAt) {
    result.status = "partial";
    result.message = `保存失败于构件组 ${failedAt}，已确认到「${result.checkpointAfter ?? "起点"}」，续传从 ${failedAt} 继续`;
    // 按队保存断点：不影响别的队到站
    batch.partials[effective.team] = {
      payload: effective,
      appliedMembers,
      afterComponentId: result.checkpointAfter ?? null,
      at,
    };
    batch.status = "partial";
  } else {
    result.status = "applied";
    result.message = result.conflicts.length
      ? `合并完成，${result.conflicts.length} 条双方改动保留双份待确认，晚到记录未覆盖任何字段`
      : "合并完成，无冲突";
    delete batch.partials[effective.team];
    // 还有别的队停在断点上时，批次整体仍是 partial
    batch.status = Object.keys(batch.partials).length > 0 ? "partial" : "received";
  }
  batch.arrivals[effective.team] = { ...result };
  batch.updatedAt = at;

  return { state, result };
}

// ---------- 冲突人工裁决 ----------

export type ConflictChoice = "keep-station" | "take-late";

/** 确认构件关系/病害/尺寸/构件冲突；裁决后对构件类变更执行级联失效重算 */
export function resolveConflict<T extends { id: string }>(
  prev: State,
  type: MemberType,
  id: string,
  candidateBy: string,
  choice: ConflictChoice,
  at: string
): State {
  const state = clone(prev);
  const tableKey = (type + "s") as "components" | "dimensions" | "defects" | "relations";
  const table = state[tableKey] as Table<any>;
  const e = table[id] as CanonicalEntry<T>;
  if (!e) return state;
  const cand = e.candidates.find((c) => c.by === candidateBy);
  if (!cand) return state;

  if (choice === "take-late") {
    pushHistory(e, e.updatedBy, e.updatedAt, `冲突裁决：保留站上 r${e.rev} 版本前留档`);
    e.data = clone(cand.data);
    e.rev += 1;
    e.updatedBy = candidateBy;
    e.updatedAt = at;
    state.log.push({
      at,
      level: "ok",
      text: `冲突 ${ref(type, id)} 已采用 ${candidateBy} 的晚到异本，站上原版本已入历史`,
    });
  } else {
    // 维持站上版本：把晚到异本本身作为一个历史版本留档（不覆盖任何字段）
    const archived: HistoryEntry<T> = {
      rev: cand.baseRev,
      data: clone(cand.data),
      by: candidateBy,
      at: cand.at,
      reason: `冲突裁决：晚到异本未采用，留档备查`,
    };
    e.history.push(archived);
    state.log.push({
      at,
      level: "ok",
      text: `冲突 ${ref(type, id)} 维持站上版本，${candidateBy} 的晚到异本已入历史留档`,
    });
  }
  e.candidates = e.candidates.filter((c) => c.by !== candidateBy);
  e.status = e.candidates.length > 0 ? "conflict" : "active";

  if (type === "component" && choice === "take-late") {
    const cas = cascadeComponentChange(state, state.components[id], at);
    if (cas.invalidated.length || cas.recomputed.length) {
      state.log.push({
        at,
        level: "warn",
        text: `冲突裁决引发级联：失效关系 ${cas.invalidated.length} 条，重算结论 ${cas.recomputed.length} 条`,
      });
    }
  }
  return state;
}

export function confirmBatch(prev: State, batchId: string, at: string): State {
  const next = clone(prev);
  const b = next.batches[batchId];
  if (!b) return next;
  const hasConflict = (["components", "dimensions", "defects", "relations"] as const).some((k) =>
    Object.values(next[k]).some((e) => e.status === "conflict")
  );
  if (b.status === "partial") {
    next.log.push({ at, level: "error", text: `批次 ${batchId} 尚有未完成的断点续传，不能整体确认` });
    return next;
  }
  if (hasConflict) {
    next.log.push({ at, level: "warn", text: `批次 ${batchId} 仍有待确认异本，暂不能整体确认` });
    return next;
  }
  b.status = "confirmed";
  b.updatedAt = at;
  next.log.push({ at, level: "ok", text: `批次 ${batchId} 全部冲突已清零，批次整体确认封存` });
  return next;
}
