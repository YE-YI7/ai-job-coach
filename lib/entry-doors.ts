/**
 * The four material-based starting points. Single source of truth for the
 * public doors, the empty workspace, the cockpit URL allowlist and telemetry,
 * so a copy change cannot drift into a second, differently-behaved entry set.
 */
export const ENTRY_KINDS = ["resume", "jd", "find_jobs", "one_sentence"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type EntryDoor = {
  kind: EntryKind;
  index: string;
  meta: string;
  title: string;
  desc: string;
  out: string;
  cta: string;
  placeholder: string;
  chips: readonly string[];
};

export const ENTRY_DOORS: readonly EntryDoor[] = [
  {
    kind: "resume",
    index: "01 · RESUME",
    meta: "NO JD NEEDED",
    title: "我有简历",
    desc: "上传或粘贴现有简历，先存进工作区，不用先找 JD。",
    out: "基础简历入库 · 可选一段经历继续",
    cta: "存我的简历",
    placeholder: "拖入简历文件，或粘贴简历原文。",
    chips: [],
  },
  {
    kind: "jd",
    index: "02 · JD",
    meta: "PASTE OR LINK",
    title: "我有目标岗位",
    desc: "贴招聘链接，或直接粘贴岗位职责和任职要求。",
    out: "岗位要求清单 · 投递判断 · 今天下一步",
    cta: "判断这个岗位",
    placeholder: "粘贴招聘链接或 JD 原文。已有基础简历会自动带入。",
    chips: [],
  },
  {
    kind: "find_jobs",
    index: "03 · FIND",
    meta: "ONE Q AT A TIME",
    title: "帮我找岗位",
    desc: "写下方向，或先说还没想清楚；导师一次只问一个问题。",
    out: "方向与硬条件澄清 · 档案够了才搜真实岗位",
    cta: "开始找岗位",
    placeholder: "例如：AI 产品 / 数据分析 · 校招 · 优先杭州。",
    chips: ["我还不确定方向，帮我先一步步定下来。"],
  },
  {
    kind: "one_sentence",
    index: "04 · TALK",
    meta: "SAY IT FIRST",
    title: "我先说一句",
    desc: "写下现在的困惑，也可以点下面的例子，选中后还能改。",
    out: "导师的一个具体问题 · 一个能做的下一步",
    cta: "和导师说",
    placeholder: "例如：投了几十份没有面试，不知道卡在哪。",
    chips: ["不知道自己适合什么", "想转行，不知道从哪开始", "有目标岗位，想看看差距", "快面试了，想先练一练"],
  },
] as const;

export const ENTRY_DOOR_BY_KIND = Object.fromEntries(ENTRY_DOORS.map((door) => [door.kind, door])) as Record<EntryKind, EntryDoor>;

/** Only the enum travels in the URL; never the resume, JD or the confusion text. */
export function entryHref(kind: EntryKind) {
  return `/cockpit?entry=${kind}`;
}

export function parseEntryKind(value: unknown): EntryKind | null {
  return typeof value === "string" && (ENTRY_KINDS as readonly string[]).includes(value) ? value as EntryKind : null;
}

/** Consume a completed/cancelled entry without losing another query or hash. */
export function withoutEntryParam(href: string) {
  const url = new URL(href, "https://entry.invalid");
  url.searchParams.delete("entry");
  return `${url.pathname}${url.search}${url.hash}`;
}

export type IntakeEntry = "direction" | "resume" | "interview";

/**
 * Doors 1–2 reuse the existing material intake: 「我有简历」 is the free
 * base-material save (`direction`), 「我有目标岗位」 is the analysed job import
 * (`resume`). Doors 3–4 start a mentor conversation and never touch intake.
 */
export function intakeEntryFor(kind: EntryKind): IntakeEntry | null {
  if (kind === "resume") return "direction";
  if (kind === "jd") return "resume";
  return null;
}

export function isMaterialEntry(kind: EntryKind) {
  return intakeEntryFor(kind) !== null;
}

/** Session titles describe the door, not the person; body text stays out of it. */
export function conversationTitle(kind: EntryKind, text: string) {
  const first = text.trim().replace(/\s+/g, " ").slice(0, 48);
  return `${kind === "find_jobs" ? "找岗位" : "先说一句"} · ${first || "待定方向"}`;
}
