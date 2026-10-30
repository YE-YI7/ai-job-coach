import type { ResumeChange } from "./types";
import { resolveResumeEdits } from "@/lib/coach-harness/application-quality";

export type ResumeReference = {
  version: 1;
  opportunityId: string;
  revision: string;
  changeId: string;
  sourceHash: string;
  changeHash: string;
};
export type ResumeReferenceSource = {
  id: string;
  resumeText?: string;
  resumeRevision?: string;
  resumeChanges: ResumeChange[];
};
export type ResolvedResumeReference = ResumeReference & {
  section: string;
  before: string;
  after: string;
  start: number;
  end: number;
};
export class ResumeReferenceError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export function parseResumeReference(value: unknown): ResumeReference {
  const ref = value as Partial<ResumeReference> | null;
  if (
    !ref ||
    ref.version !== 1 ||
    typeof ref.opportunityId !== "string" ||
    ref.opportunityId.length > 100 ||
    typeof ref.revision !== "string" ||
    ref.revision.length > 200 ||
    typeof ref.changeId !== "string" ||
    ref.changeId.length > 200 ||
    !/^[a-f0-9]{64}$/.test(ref.sourceHash || "") ||
    !/^[a-f0-9]{64}$/.test(ref.changeHash || "")
  ) {
    throw new ResumeReferenceError(
      "引用格式无效，请重新点选这处修改；尚未调用模型。",
      400,
    );
  }
  return {
    version: 1,
    opportunityId: ref.opportunityId,
    revision: ref.revision,
    changeId: ref.changeId,
    sourceHash: ref.sourceHash!,
    changeHash: ref.changeHash!,
  };
}
/** Deterministic coordinates, never a semantic/LLM search. Ownership is checked by the caller. */
export async function makeResumeReference(
  source: ResumeReferenceSource,
  changeId: string,
): Promise<ResolvedResumeReference> {
  const resume = (source.resumeText || "").trim();
  const matches = source.resumeChanges.filter(
    (change) => change.id === changeId,
  );
  if (matches.length !== 1)
    throw new ResumeReferenceError(
      "这处修改已变化，请重新点选引用；尚未调用模型。",
    );
  const change = matches[0];
  const resolved = resolveResumeEdits(resume, source.resumeChanges).edits.find(
    (edit) => edit.change.id === changeId,
  );
  if (!resolved)
    throw new ResumeReferenceError(
      "这处修改不能唯一定位，请先处理重叠建议；尚未调用模型。",
    );
  const [sourceHash, changeHash] = await Promise.all([
    digest(resume),
    digest(
      JSON.stringify([
        change.before,
        change.after,
        change.status,
        change.previousDecision ?? null,
      ]),
    ),
  ]);
  return {
    version: 1,
    opportunityId: source.id,
    revision: source.resumeRevision || "",
    changeId,
    sourceHash,
    changeHash,
    section: change.section,
    before: resume.slice(resolved.start, resolved.end),
    after: change.after,
    start: resolved.start,
    end: resolved.end,
  };
}
export function referencePointer(ref: ResumeReference): ResumeReference {
  return parseResumeReference(ref);
}
export function sameResumeReference(
  a?: ResumeReference | null,
  b?: ResumeReference | null,
) {
  return !a || !b
    ? !a && !b
    : a.opportunityId === b.opportunityId &&
        a.revision === b.revision &&
        a.changeId === b.changeId &&
        a.sourceHash === b.sourceHash &&
        a.changeHash === b.changeHash;
}
export async function resolveResumeReference(
  raw: unknown,
  source: ResumeReferenceSource,
) {
  const ref = parseResumeReference(raw);
  if (ref.opportunityId !== source.id)
    throw new ResumeReferenceError(
      "引用属于另一份简历，请回到原岗位或重新引用；尚未调用模型。",
    );
  const current = await makeResumeReference(source, ref.changeId);
  if (
    ref.revision !== current.revision ||
    ref.sourceHash !== current.sourceHash ||
    ref.changeHash !== current.changeHash
  )
    throw new ResumeReferenceError(
      "简历或这处修改已更新，请重新引用；输入保留，尚未调用模型。",
    );
  return current;
}
export function resumeReferenceContext(ref: ResolvedResumeReference) {
  return `用户主动引用的确切修改（定位已由代码核验；引用不是已确认经历，也不代表同意执行改稿）：\n${JSON.stringify(
    {
      changeId: ref.changeId,
      section: ref.section,
      sourceStart: ref.start,
      sourceEnd: ref.end,
      original: ref.before,
      suggestion: ref.after,
    },
  )}\n只回答这处相关问题。是否改稿仍按用户本条意愿判断，不把AI建议当作用户提供的新事实。`;
}
