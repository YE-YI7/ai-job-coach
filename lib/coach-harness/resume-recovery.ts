/** A factual follow-up anchored to a supplied line, never inferred experience. */
export const RESUME_SUPPLEMENT_MARKER = "补充经历（用户提供，待核实）：";
export interface ResumeRecovery { sourceExcerpt: string; question: string; detailSaved?: boolean }

export function resumeRecovery(resume: string): ResumeRecovery {
  const suppliedDetail = resume.split(RESUME_SUPPLEMENT_MARKER).at(-1)?.trim();
  if (resume.includes(RESUME_SUPPLEMENT_MARKER) && suppliedDetail) {
    return { sourceExcerpt: suppliedDetail.slice(0, 260), question: "补充已保存。本次 AI 改稿仍未通过核验，不需要反复补同一段；你可以保留当前内容，直接编辑、预览或保存 PDF。", detailSaved: true };
  }
  const lines = resume.split(/\n/).map(line => line.trim()).filter(Boolean);
  const experience = lines.find(line => /负责|参与|协助|完成|整理|制作|维护|搭建|设计|开发|运营|项目/.test(line)
    && line.length > 12 && !/@|https?:|电话|邮箱|手机/.test(line));
  const sourceExcerpt = experience?.slice(0, 260) || "";
  return {
    sourceExcerpt,
    question: sourceExcerpt ? "这件事里，你本人具体做了哪一步？举一个真实例子：处理了什么、交付了什么；没有数字也可以。"
      : "选一件你实际做过的事：当时要解决什么问题，你本人做了什么，最后交付了什么？没有正式工作经历也可以写课程或个人项目。",
  };
}

export function appendResumeSupplement(resume: string, answer: string): string {
  const detail = answer.trim();
  if (!detail || detail.length > 2000) throw new Error("请填写 1–2000 字的真实补充");
  const text = `${resume.trim()}\n\n${RESUME_SUPPLEMENT_MARKER}\n${detail}`;
  if (text.length > 30000) throw new Error("简历与补充合计超过 30000 字，请先精简后保存");
  return text;
}
