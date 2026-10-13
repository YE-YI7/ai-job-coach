/**
 * 首屏分组与零候选说明（PRD 2026-10-08 §5 A2）。
 *
 * 这两件事都是判定，不是样式，所以放在可测的模块里，界面只负责把 `action` 对上按钮：
 * - 首屏至多三条：再多就变成列表，用户不会逐条读依据；
 * - 一条岗位都没有时必须说清是**哪种**没有，并只给一个可选动作。
 *   「暂无符合条件的岗位，可调整方向或导入 JD」这句旧话把三种完全不同的原因说成了同一种，
 *   来源挂了的用户会以为是自己条件太严，条件太严的用户会以为市场上没货。
 */
export const FIRST_SCREEN = 3;

/** 被筛掉与都没读到的岗位都要参与判断，所以这里只收计数，不收岗位对象。 */
export interface ZeroCandidateInput {
  failedSources: string[];
  filteredCount: number;
  trackedCount: number;
  /** 用户设了公司档位时，放宽档位是比「看原因」更能立刻走通的那一步。 */
  tierFilterActive: boolean;
}

export type ZeroCandidateAction = "search_again" | "relax_tiers" | "show_filtered" | "import_own_jd";

export interface ZeroCandidateState {
  cause: "source_failure" | "constraint" | "supply";
  copy: string;
  action: ZeroCandidateAction;
  actionLabel: string;
}

export function zeroCandidateState(input: ZeroCandidateInput): ZeroCandidateState {
  if (input.failedSources.length) {
    return {
      cause: "source_failure",
      copy: "招聘来源暂时不可用。",
      action: "search_again", actionLabel: "重新查找一次",
    };
  }
  if (input.filteredCount) {
    return input.tierFilterActive
      ? { cause: "constraint", copy: "本轮没有符合公司偏好的岗位。", action: "relax_tiers", actionLabel: "放宽公司偏好" }
      : { cause: "constraint", copy: "本轮没有符合已知条件的岗位。", action: "show_filtered", actionLabel: "查看筛选原因" };
  }
  return {
    cause: "supply",
    copy: input.trackedCount ? "找到的岗位已在你的机会列表中。" : "本轮暂未找到合适岗位。",
    action: "import_own_jd", actionLabel: "添加已有岗位",
  };
}

/** 首屏只给三条；剩下的收进「更多候选」，仍然可达但不抢注意力。 */
export function splitFirstScreen<T>(jobs: T[]): { lead: T[]; rest: T[] } {
  return { lead: jobs.slice(0, FIRST_SCREEN), rest: jobs.slice(FIRST_SCREEN) };
}

/** Unknown eligibility is never disguised as a priority recommendation. */
export function groupCandidates<T extends {review?:{eligibility:string}|null}>(jobs:T[]) {
  const eligible=jobs.filter(job=>job.review?.eligibility==="pass");
  return {...splitFirstScreen(eligible),unknown:jobs.filter(job=>!job.review || job.review.eligibility==="unknown")};
}
