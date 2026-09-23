import type { RequirementEvidence } from "./types";

// 改简历/练回答补不了的差距：硬要求缺证据（missing）或待核实（unverified）。
// 这类差距只能靠用户补充真实经历或材料解决，应触发导师主动提问。
export function uncoverableGap(requirements: RequirementEvidence[]): RequirementEvidence | null {
  const reqs = requirements || [];
  return reqs.find((r) => r.importance === "critical" && (r.strength === "missing" || r.strength === "unverified"))
    || reqs.find((r) => r.strength === "missing")
    || null;
}
