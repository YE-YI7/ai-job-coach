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
      copy: `这一批没有岗位，是因为来源没读到：${input.failedSources.join("、")} 暂时没响应。不是市场上没有合适的，也不是你的条件把它们筛掉了。`,
      action: "search_again", actionLabel: "重新查找一次",
    };
  }
  if (input.filteredCount) {
    return input.tierFilterActive
      ? { cause: "constraint", copy: `${input.filteredCount} 个岗位都因为公司档位被移到下面了，所以首屏没有候选。`, action: "relax_tiers", actionLabel: "先不设公司档位，重新找一次" }
      : { cause: "constraint", copy: `${input.filteredCount} 个岗位都因为已知条件被移到下面了，所以首屏没有候选。`, action: "show_filtered", actionLabel: "看它们分别卡在哪一条" };
  }
  return {
    cause: "supply",
    copy: `这轮公开的招聘来源里没读到你当前方向能对得上的在招岗位${input.trackedCount ? `（读到的 ${input.trackedCount} 条你已经在跟踪，不再占候选位）` : ""}。这是供给有限，不是条件把它们排除了。`,
    action: "import_own_jd", actionLabel: "把你手上的 JD 交给益职看看",
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
