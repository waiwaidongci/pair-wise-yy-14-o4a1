import { useCallback, useEffect, useState } from "react";
import {
  ConflictChoice,
  confirmBatch as confirmBatchFn,
  receiveArrival,
  recomputeRelation as recomputeRelationFn,
  resolveConflict as resolveConflictFn,
} from "./merge";
import { baselineState, legacyDraft, teamAPayload, teamARetry, teamBPayload } from "./seed";
import { ArrivalResult, MemberType, Payload, State } from "./types";

const LS_KEY = "survey-merge-state-v1";
const LS_FAIL = "survey-fail-group";

export function failGroup(): string | null {
  return localStorage.getItem(LS_FAIL);
}
export function setFailGroup(cid: string | null): void {
  if (cid) localStorage.setItem(LS_FAIL, cid);
  else localStorage.removeItem(LS_FAIL);
}

const LS_FIRED = "survey-fail-fired";

function persist(snapshot: State, afterComponentId: string | null): void {
  const bad = failGroup();
  const fired = localStorage.getItem(LS_FIRED) === "1";
  if (bad && !fired && afterComponentId === bad) {
    // 模拟该构件组落盘瞬间掉电：一次性触发，回滚整组，恢复后不再触发
    localStorage.setItem(LS_FIRED, "1");
    throw new Error(`存储介质写入失败（模拟构件组 ${bad} 落盘掉电）`);
  }
  localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
}

function load(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* 损坏则重建 */
  }
  return baselineState();
}

let tick = 0;
const clock = () => `2026-10-04T${String(9 + Math.floor(tick / 6)).padStart(2, "0")}:${String(
  10 + tick++
).padStart(2, "0")}:00+08:00`;

export function useEngine() {
  const [state, setState] = useState<State>(load);
  const [lastResult, setLastResult] = useState<ArrivalResult | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  const receive = useCallback((p: Payload) => {
    setState((prev) => {
      const { state: next, result } = receiveArrival(prev, p, { persist, at: clock });
      setLastResult(result);
      return next;
    });
  }, []);

  const resolve = useCallback(
    (type: MemberType, id: string, by: string, choice: ConflictChoice) => {
      setState((prev) => resolveConflictFn(prev, type, id, by, choice, clock()));
    },
    []
  );

  const recompute = useCallback((id: string, verdict: "reaffirm" | "rebuilt" | "retired") => {
    setState((prev) => recomputeRelationFn(prev, id, clock(), verdict));
  }, []);

  const confirm = useCallback((batchId: string) => {
    setState((prev) => confirmBatchFn(prev, batchId, clock()));
  }, []);

  const archiveLegacy = useCallback(() => receive(legacyDraft), [receive]);

  const reset = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setFailGroup(null);
    localStorage.removeItem(LS_FIRED);
    tick = 0;
    setState(baselineState());
    setLastResult(null);
  }, []);

  return {
    state,
    lastResult,
    actions: {
      receiveTeamA: () => receive(teamAPayload),
      receiveTeamB: () => receive(teamBPayload),
      retryTeamA: () => receive(teamARetry),
      archiveLegacy,
      resolve,
      recompute,
      confirm,
      reset,
      repairStorage: () => {
        setFailGroup(null);
        localStorage.removeItem(LS_FIRED);
      },
      armFailure: (cid: string) => {
        setFailGroup(cid);
        localStorage.removeItem(LS_FIRED);
      },
    },
  };
}
