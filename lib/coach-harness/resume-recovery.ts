import { nextResumeQuestion } from "./resume-task-types";
/** A factual follow-up anchored to a supplied line, never inferred experience. */
export const RESUME_SUPPLEMENT_MARKER = "补充经历（用户提供，待核实）：";
export interface ResumeRecovery { sourceExcerpt: string; question: string; detailSaved?: boolean }

/** Preserve provenance per line; adding one self-report must not relabel an entire upload. */
export function resumeSourceLines(resume: string) {
  let supplement = false;
  return resume.split(/\n+/).flatMap(raw => {
    const text = raw.trim();
    if (text === RESUME_SUPPLEMENT_MARKER) { supplement = true; return []; }
    return text ? [{ text, supplement }] : [];
  }).slice(0, 120);
}

export function resumeRecovery(resume: string): ResumeRecovery {
  const suppliedDetail = resume.split(RESUME_SUPPLEMENT_MARKER).at(-1)?.trim();
  if (resume.includes(RESUME_SUPPLEMENT_MARKER) && suppliedDetail) {
    return { sourceExcerpt: suppliedDetail.slice(0, 260), question: "补充已保存。本次 AI 改稿仍未通过核验，不需要反复补同一段；你可以保留当前内容，直接编辑、预览或保存 PDF。", detailSaved: true };
  }
  const lines = resume.split(/\n/).map(line => line.trim()).filter(Boolean);
  const experience = lines.find(line => /负责|参与|协助|完成|整理|制作|维护|搭建|设计|开发|记录|核对/.test(line)
    && line.length > 12 && !/^#|^(?:姓名|教育|技能|意向|求职方向)\s*[:：]/.test(line) && !/@|https?:|电话|邮箱|手机|\d{11}/.test(line));
  const sourceExcerpt = experience?.slice(0, 260) || "";
  return {
    sourceExcerpt,
    question: sourceExcerpt ? "这段经历里，你本人实际做的第一件事是什么？没有数字也可以。"
      : "请说一件你实际做过的事，先只说你做了什么？课程或个人项目也可以。",
  };
}

/** A model may ask only one anchored question, never replace a saved answer. */
export function modelResumeRecovery(resume: string, value: unknown): ResumeRecovery | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const question = nextResumeQuestion(resume,raw,[]);
  if (!question) return null;
  const existing = resumeRecovery(resume);
  return existing.detailSaved ? existing : question;
}

export function appendResumeSupplement(resume: string, answer: string): string {
  const detail = answer.trim();
  if (!detail || detail.length > 2000) throw new Error("请填写 1–2000 字的真实补充");
  const text = `${resume.trim()}\n\n${RESUME_SUPPLEMENT_MARKER}\n${detail}`;
  if (text.length > 30000) throw new Error("简历与补充合计超过 30000 字，请先精简后保存");
  return text;
}
