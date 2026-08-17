import { compileContextBundle } from "./context";
import { findClaimConflicts, validateArtifactDraft } from "./consistency";
import type { CareerClaim } from "./types";

const claim = (overrides: Partial<CareerClaim> = {}): CareerClaim => ({
  id: "claim-1",
  entityType: "experience",
  entityKey: "project-a",
  claimType: "result",
  value: { result: "转化率提升 18%" },
  displayText: "负责项目 A，转化率提升 18%",
  sourceExcerpt: "负责项目 A，转化率提升 18%",
  status: "confirmed",
  visibility: "recruiter_safe",
  ...overrides,
});

describe("coach harness consistency", () => {
  test("accepts content backed by a confirmed claim", () => {
    const bundle = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims: [claim()] });
    const report = validateArtifactDraft({
      artifactType: "resume",
      sections: [{ path: "experience.0", content: "推动项目 A，转化率提升 18%", claimIds: ["claim-1"] }],
    }, bundle);
    expect(report.ok).toBe(true);
  });

  test("blocks invented numbers and unconfirmed claims", () => {
    const bundle = compileContextBundle({
      task: "resume_workshop",
      userId: "user-1",
      claims: [claim({ status: "unverified" })],
    });
    const report = validateArtifactDraft({
      artifactType: "resume",
      sections: [{ path: "experience.0", content: "转化率提升 30%", claimIds: ["claim-1"] }],
    }, bundle);
    expect(report.ok).toBe(false);
    expect(report.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["unconfirmed_claim", "unsupported_number"]));
  });

  test("finds two versions of the same fact", () => {
    expect(findClaimConflicts([
      claim(),
      claim({ id: "claim-2", value: { result: "转化率提升 21%" }, displayText: "转化率提升 21%" }),
    ])).toHaveLength(1);
  });

  test("blocks Chinese quantities that are not present in the cited claim", () => {
    const bundle = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims: [claim()] });
    const report = validateArtifactDraft({
      artifactType: "resume",
      visibility: "recruiter_safe",
      sections: [{ path: "experience.0", content: "覆盖 30万 用户并带领 8人 团队，转化率提升 18%", claimIds: ["claim-1"] }],
    }, bundle);
    expect(report.issues.filter((item) => item.code === "unsupported_number").map((item) => item.token)).toEqual(expect.arrayContaining(["30万", "8人"]));
  });

  test("blocks private claims from recruiter-facing artifacts", () => {
    const bundle = compileContextBundle({
      task: "resume_workshop",
      userId: "user-1",
      claims: [claim({ visibility: "private" })],
    });
    const report = validateArtifactDraft({
      artifactType: "resume",
      visibility: "recruiter_safe",
      sections: [{ path: "experience.0", content: "推动项目 A，转化率提升 18%", claimIds: ["claim-1"] }],
    }, bundle);
    expect(report.issues.map((item) => item.code)).toContain("private_claim_exposure");
  });
});
