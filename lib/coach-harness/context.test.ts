import { compileContextBundle } from "./context";
import type { CareerClaim } from "./types";

const claims: CareerClaim[] = [{
  id: "skill-1",
  entityType: "skill",
  entityKey: "typescript",
  claimType: "proficiency",
  value: "used_in_production",
  displayText: "在生产项目中使用 TypeScript",
  status: "confirmed",
  visibility: "recruiter_safe",
  updatedAt: "2026-08-14T00:00:00.000Z",
}];

test("context fingerprint is stable across compile time", () => {
  const first = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims, now: new Date("2026-08-14") });
  const second = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims, now: new Date("2026-08-15") });
  expect(first.fingerprint).toBe(second.fingerprint);
  expect(first.allowedClaimIds).toEqual(["skill-1"]);
});
