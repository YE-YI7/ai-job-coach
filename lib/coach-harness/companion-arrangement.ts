/** 边界判断：权限、版本之外的明确分流。职业名取用户原话，不把没出现的经历补进去。 */

export type CompanionRoute = "arrange" | "interview" | "resume" | "discuss" | "end";

export interface CompanionStep {
  title: string;
  why: string;
  effort: string | null;
  deliverable: string;
  check: string;
  stuck: string;
}

export interface CompanionStage {
  title: string;
  note: string;
}

export interface CompanionDecision {
  route: CompanionRoute;
  goalTitle: string;
  answer: string;
  question: string | null;
  step: CompanionStep | null;
  stages: CompanionStage[];
  weeklyHours: string | null;
  deadline: string | null;
  readSubmission: boolean;
}

export interface CompanionSubmission {
  id: string;
  text: string;
  savedAt: string;
  feedback: string | null;
  review: "none" | "saved" | "failed";
  payloadHash?: string;
  requestId?: string | null;
  reviewNote?: string | null;
}

export interface CompanionTask {
  goalKey: string;
  goalTitle: string;
  sourceText: string;
  weeklyHours: string | null;
  deadline: string | null;
  answer: string;
  question: string | null;
  step: CompanionStep | null;
  route: CompanionRoute;
  action: "not_started" | "in_progress" | "submitted" | "paused" | "skipped" | "ended";
  stages: CompanionStage[];
  submissions: CompanionSubmission[];
  opportunityId?: string | null;
  stuckNote?: string | null;
  mentorRequestId?: string | null;
  mentorFeedback?: string | null;
  reviewNote?: string | null;
}

const hours = (text: string) => {
  const counted = text.match(/每周\s*(?:(?:能|可以|可)\s*)?(?:(?:投入|抽出|花)\s*)?(\d+(?:\.\d+)?)\s*(?:个)?小时/);
  if (counted) return `每周 ${counted[1]} 小时`;
  return /只有周末/.test(text) ? "只有周末" : null;
};

function affirmativeRole(text: string) {
  const clauses = text.split(/[，,。；;\n]/).filter(clause => !/不想转|不要转|不是转|不再转|别给我定/.test(clause));
  const matches = [...clauses.join("，").matchAll(/(?:想转(?:行做|行成为|行)?|要转(?:行做|行成为|行)?|转为|目标是|目标为|目标转行(?:做|成为)?)\s*([^，,。；;\n]{2,30})/g)];
  return matches.at(-1)?.[1]?.trim() || null;
}

function goalTitleFor(role: string) {
  const compact = role.replace(/\s+/g, "");
  if (compact === "AI产品经理") return "转 AI 产品经理";
  return `转${compact}`;
}

function deniesExperience(text: string) {
  return /没有工作|没工作经历|没有实习|没实习|没有任何实习|刚毕业|应届/.test(text);
}

function claimsExperience(text: string) {
  return /做了几年|工作过|有工作经历/.test(text) && !deniesExperience(text);
}

function arrangeStep(text: string, weeklyHours: string | null, prior?: CompanionTask | null): CompanionStep {
  const why = deniesExperience(text)
    ? "你说了还没有工作或实习经历，不能补成已有经历。"
    : claimsExperience(text)
      ? "你提到做过一段时间的工作。先确认一个真实问题，才能判断后面做什么练习。"
      : prior?.step?.why || "先确认一个具体的事，不把没说过的经历补进去。";
  return {
    title: prior?.step?.title || "从你刚才说的事里选一个具体问题",
    why,
    effort: weeklyHours ? `${weeklyHours}，一次只写几句` : prior?.step?.effort ?? null,
    deliverable: weeklyHours ? "谁会遇到、现在怎么做" : prior?.step?.deliverable || "谁会遇到、现在怎么做、哪一步最费时",
    check: prior?.step?.check || "能指向一次具体发生的事；没有职业匹配分。",
    stuck: prior?.step?.stuck || "选不出来就写两个候选，标出你更熟的那个。",
  };
}

export function decideCompanion(text: string, prior?: CompanionTask | null): CompanionDecision {
  const said = text.trim();
  const role = affirmativeRole(said);
  const goalTitle = role
    ? goalTitleFor(role)
    : /不是转|不想转|不要转|不再转|不再做原方向|别给我定/.test(said)
      ? said.slice(0, 80)
      : prior?.goalTitle || said.slice(0, 80);
  const sameGoal = !role || !prior || goalTitle === prior.goalTitle;
  const weeklyHours = hours(said) || (sameGoal ? prior?.weeklyHours : null) || null;
  const deadline = said.match(/(?:明天|后天|这周[一二三四五六日天]|下周[一二三四五六日天]|\d+月\d+[日号]|\d+\s*(?:周|个月|天)后)(?:上午|下午|晚上)?/)?.[0] || (sameGoal ? prior?.deadline : null) || null;
  const base = { weeklyHours, deadline, stages: [] as CompanionStage[], readSubmission: false };
  if (/不要改简历|为什么这样写/.test(said)) {
    return { ...base, route: "discuss", goalTitle: prior?.goalTitle || "先讨论，不改简历", answer: "这轮只讨论写法，不会改简历，也不会用掉单段改稿。", question: null, step: null };
  }
  if (/只改这段|改这段实习/.test(said)) {
    return { ...base, route: "resume", goalTitle: "改一段已有经历", answer: "直接走原来的单段改稿。不会插课程，也不会因为换了入口再领一次免费整稿。", question: null, step: null };
  }
  if (/面试(?!官)/.test(said) && /准备|练习|练|追问/.test(said) && !/不要(?:练|准备)|不想(?:练|准备)|不练面试/.test(said)) {
    const soon = /明天下午/.test(said);
    return { ...base, route: "interview", goalTitle: soon ? "准备明天下午的面试" : prior?.goalTitle || "准备这次面试", answer: "先练这次项目追问。不安排一周学习。", question: "这次最想练哪一段项目？", step: null };
  }
  if (/先到这里|暂时到这里/.test(said)) {
    return { ...base, route: "end", goalTitle: prior?.goalTitle || "这次先停", answer: "这次可以停在这里。没有新的缺口要补，也不会再派一道迁移题。", question: null, step: null };
  }
  if (/^https?:\/\//.test(said) && said.split(/\s+/).length < 8) {
    return { ...base, route: "arrange", goalTitle: prior?.goalTitle || "先看你交来的材料", answer: "链接已经可以保存。我还没有打开它，不能说看过里面的内容。可以把关键几句贴过来。", question: null, step: prior?.step || null };
  }
  if (/不知道适合什么|先帮我判断/.test(said)) {
    return { ...base, route: "arrange", goalTitle: "先判断方向，不指定职业", answer: "一句话还不能指定职业，也不会打适配分。先拿一件你做过的事来看。", question: null, step: { title: "写下最近一件你独立推进过的事", why: "方向未定，先看你实际做过什么，而不是先选一个职业名。", effort: weeklyHours ? `${weeklyHours}，一次只写几句` : "15 分钟", deliverable: "谁、你做了什么、结果里哪一句是你自己的", check: "能指出一次具体的事；没有职业匹配分。", stuck: "想不起来就写「还没选定」，这是有效回复。" }, readSubmission: true };
  }
  if (/AI效率工具|做个AI/.test(said) && !/三张表|字段不一致/.test(said)) {
    return { ...base, route: "arrange", goalTitle: prior?.goalTitle || "先把问题说具体", answer: "「做个 AI 工具」还不是一个问题。先不把它当成已经完成的需求研究。", question: "这件重复的事，是谁在做，现在具体怎么做？", step: prior?.step || null, readSubmission: true };
  }
  if (/三张表|字段不一致/.test(said)) {
    return { ...base, route: "arrange", goalTitle, answer: `你写了「${said}」。这是待讨论的原始描述，具体建议等导师结合材料判断。`, question: null, step: arrangeStep(said, weeklyHours, sameGoal ? prior : null), readSubmission: true };
  }
  const askedPython = /python/i.test(said);
  return {
    ...base,
    route: "arrange",
    goalTitle,
    answer: askedPython && /AI\s*产品经理/i.test(goalTitle)
      ? `目标就按${goalTitle}。不必先学 Python。先从你刚才说的事里找一个真实问题。`
      : role
        ? `目标就按${goalTitle}。不另换成别的职业。`
        : prior
          ? "按你补充的约束调整这一步，不另换目标。"
          : "先接住你刚才的原话，不另做职业定位。",
    question: null,
    step: arrangeStep(said, weeklyHours, sameGoal ? prior : null),
    readSubmission: true,
  };
}

export function reviewSubmission(task: CompanionTask, text: string): string {
  const decision = decideCompanion(text, task);
  if (!decision.readSubmission && /^https?:\/\//.test(text.trim())) return decision.answer;
  if (decision.question && /AI效率工具|做个AI/.test(text)) return `${decision.answer} ${decision.question}`;
  if (/三张表/.test(text)) return decision.answer;
  const excerpt = text.trim().slice(0, 42);
  return excerpt
    ? `你写了「${excerpt}」。这句已经具体到可以接着看。还缺一次真实发生的经过：谁在做、卡在哪一步。`
    : "这次提交是空的，还不能当作完成。";
}

export function shrinkStep(step: CompanionStep, note: string): CompanionStep {
  const first = step.deliverable.split("、")[0] || step.deliverable;
  return { ...step, effort: "10 分钟", deliverable: `先只写：${first}`, stuck: note.trim().slice(0, 80) || step.stuck };
}
