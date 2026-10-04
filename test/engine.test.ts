import assert from "node:assert";
import { receiveArrival, resolveConflict, recomputeRelation, confirmBatch } from "../src/engine/merge";
import { baselineState, teamAPayload, teamBPayload, teamARetry, legacyDraft } from "../src/engine/seed";
import { Payload } from "./src/engine/types";

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log("  ✓", name); pass++; };

// 故障注入：在指定构件组落盘时抛一次
function makePersist(failOnceAt: string | null) {
  let fired = false;
  return (_s: any, after: string | null) => {
    if (failOnceAt && !fired && after === failOnceAt) {
      fired = true;
      throw new Error("disk down at " + failOnceAt);
    }
  };
}

console.log("1) 四类记录挂同一批次 + 甲队先到（L02/L03 更换 → 级联）");
{
  let s = baselineState();
  const r1 = receiveArrival(s, teamAPayload, { persist: makePersist(null) });
  s = r1.state;
  const b = s.batches["BATCH-2021004-A" as never] ?? s.batches["BATCH-20261004-A"];
  ok("批次创建且四类成果挂入", !!b);
  ok("L02 现行版本为更换件", s.components.L02.data.replaced === true);
  ok("D02 新构件入库 r1", s.components.D02.rev === 1);
  ok("R-02 引用 L02 已失效", s.relations["R-02"].status === "invalid");
  ok("R-03 引用 L03 已失效", s.relations["R-03"].status === "invalid");
  ok("R-01 未引用更换件仍现行", s.relations["R-01"].status === "active");
  ok("F-05 修缮结论按更换件重算", s.defects["F-05"].data.advice.includes("已更换"));
  ok("F-05 旧结论在历史留档", s.defects["F-05"].history.some((h) => h.data.advice === "裂缝注胶加箍，纳入修缮计划"));
  ok("R-02 旧关系在历史留档", s.relations["R-02"].history.length === 1);
  ok("新尺寸 C-L02 入库", s.dimensions["C-L02"].data.section === "155×205");
}

console.log("2) 乙队晚到，双方都改过同一基线 → 两份保留，晚到绝不覆盖");
{
  let s = baselineState();
  s = receiveArrival(s, teamAPayload, { persist: makePersist(null) }).state;
  const r2 = receiveArrival(s, teamBPayload, { persist: makePersist(null) });
  s = r2.state;
  ok("结果报告 3 条冲突", r2.result.conflicts.length === 3);
  ok("L02 站上仍是甲队的更换件（未被乙队覆盖）", s.components.L02.data.replaced === true);
  ok("L02 状态 conflict 且保留乙队异本", s.components.L02.status === "conflict" && s.components.L02.candidates[0]?.by === "乙队");
  ok("F-01 站上是甲队'轻度'，乙队'重度'在候选", s.defects["F-01"].data.severity === "轻" && s.defects["F-01"].candidates[0].data.severity === "重");
  ok("R-01 两份并存", s.relations["R-01"].status === "conflict");
  ok("Z01 仅乙队单边改（基线直改）→ 直接采用", s.components.Z01.data.wood === "柏木" && s.components.Z01.candidates.length === 0);
}

console.log("3) 同批次重传只认第一次（内容不同也不落库）");
{
  let s = baselineState();
  s = receiveArrival(s, teamAPayload, { persist: makePersist(null) }).state;
  const dup = receiveArrival(s, teamARetry, { persist: makePersist(null) });
  s = dup.state;
  ok("重传返回 duplicate", dup.result.status === "duplicate");
  ok("伪造构件 FAKE-99 未入库", !s.components["FAKE-99"]);
  ok("载荷校验保持第一次", dup.result.payloadHash === s.batches["BATCH-20261004-A"].arrivals["甲队"].payloadHash);
}

console.log("4) 保存失败 → 回滚到最后确认构件，续传只补齐剩余组");
{
  let s = baselineState();
  // 组件分组排序后 L03 位于 L02 之后；在 L03 落盘时掉电
  const r1 = receiveArrival(s, teamAPayload, { persist: makePersist("L03") });
  s = r1.state;
  ok("首次到站状态 partial", r1.result.status === "partial");
  ok("检查点停在 L02", r1.result.checkpointAfter === "L02");
  ok("L03 组整组回滚：L03 未更新为更换件", s.components.L03.data.replaced !== true);
  ok("同组 F-05 未重算", !s.defects["F-05"].data.advice.includes("已更换"));
  ok("L02 及之前已确认保留", s.components.L02.data.replaced === true);
  ok("批次记录为 partial，首次载荷被暂存", s.batches["BATCH-20261004-A"].status === "partial");

  // 乙队晚到：与已确认的 L02 改动形成冲突
  s = receiveArrival(s, teamBPayload, { persist: makePersist(null) }).state;
  ok("乙队仍可到站，L02 双方改动双留", s.components.L02.status === "conflict");

  // 修复后续传（同一队再次到站 → 走 pendingPayload，不算 duplicate）
  const cont = receiveArrival(s, teamARetry, { persist: makePersist(null) });
  s = cont.state;
  ok("续传不是 duplicate", cont.result.status !== "duplicate");
  ok("续传补齐 L03", s.components.L03.data.replaced === true && s.batches["BATCH-20261004-A"].status !== "partial");
  ok("续传不重复接受已确认组（applied 只含新增）", !cont.result.applied.includes("component:L02"));

  // 再重传 → duplicate
  const again = receiveArrival(s, teamARetry, { persist: makePersist(null) });
  ok("完成后再重传 → duplicate", again.result.status === "duplicate");
}

console.log("5) 冲突裁决后级联 + 关系重算 + 批次整体确认");
{
  let s = baselineState();
  s = receiveArrival(s, teamAPayload, { persist: makePersist(null) }).state;
  s = receiveArrival(s, teamBPayload, { persist: makePersist(null) }).state;
  // L02 采用乙队（取消更换）→ R-02 会怎样？乙版非更换件；裁决 take-late 触发级联检查
  s = resolveConflict(s, "component", "L02", "乙队", "take-late", "t1");
  ok("L02 采用乙队版本，无候选", s.components.L02.data.name === "三穿梁" && s.components.L02.candidates.length === 0);
  ok("甲队更换版入历史可查", s.components.L02.history.some((h) => JSON.stringify(h.data).includes("三穿梁(更换)")));
  // 采用乙队（非更换件）后，R-02 保持 invalid（之前因更换失效），需人工重算
  s = recomputeRelation(s, "R-02", "t2", "rebuilt");
  ok("R-02 依新件重接恢复 active", s.relations["R-02"].status === "active");
  s = recomputeRelation(s, "R-03", "t2", "retired");
  ok("R-03 判废归档仍 invalid 但有结论", s.relations["R-03"].status === "invalid");
  // 清掉其余冲突
  s = resolveConflict(s, "defect", "F-01", "乙队", "keep-station", "t3");
  s = resolveConflict(s, "relation", "R-01", "乙队", "keep-station", "t3");
  const before = confirmBatch(s, "BATCH-20261004-A", "t4");
  ok("全部冲突清零后批次可确认", before.batches["BATCH-20261004-A"].status === "confirmed");

  // 有冲突时不能确认
  let s2 = baselineState();
  s2 = receiveArrival(s2, teamAPayload, { persist: makePersist(null) }).state;
  s2 = receiveArrival(s2, teamBPayload, { persist: makePersist(null) }).state;
  const refused = confirmBatch(s2, "BATCH-20261004-A", "t");
  ok("存在冲突时拒绝整体确认", refused.batches["BATCH-20261004-A"].status === "received");
}

console.log("6) 无批次号老草稿按测量日期归档，不进主数据");
{
  let s = baselineState();
  const r = receiveArrival(s, legacyDraft, { persist: makePersist(null) });
  s = r.state;
  ok("返回 rejected/归档", r.result.status === "rejected");
  ok("草稿按测量日 2026-08-15 归档", s.archives.some((g) => g.date === "2026-08-15"));
  ok("草稿构件不进主数据", !s.components["X-OLD"]);
  // 同日第二份归到同组
  const second: Payload = JSON.parse(JSON.stringify(legacyDraft));
  second.team = "另一队";
  s = receiveArrival(s, second, { persist: makePersist(null) }).state;
  ok("同日草稿归入同一日期组", s.archives.find((g) => g.date === "2026-08-15")!.drafts.length === 2);
}

console.log(`\n全部 ${pass} 项语义检查通过 ✔`);
