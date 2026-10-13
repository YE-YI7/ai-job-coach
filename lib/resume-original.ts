import type { Opportunity } from "./opportunities/types";

export type ResumeOriginal = NonNullable<Opportunity["resumeOriginal"]>;
export const ORIGINAL_RESUME_BUCKET = "resume-originals";
export const ORIGINAL_RESUME_LIMIT = 4 * 1024 * 1024;
export function originalResumeMime(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ["txt", "md"].includes(ext || "") ? "text/plain" : null;
}
export function ownsOriginalResumePath(owner: string, path: string) {
  return path.startsWith(`${owner}/`) && /^[0-9a-f-]{36}\.(pdf|docx|txt|md)$/.test(path.slice(owner.length + 1));
}
export function originalResumeUrl(original: ResumeOriginal, download = false) {
  return `/api/coach/resume-original?path=${encodeURIComponent(original.path)}&name=${encodeURIComponent(original.name)}${download ? "&download=1" : ""}`;
}
export async function uploadOriginalResume(file: File): Promise<ResumeOriginal> {
  const form = new FormData(); form.set("file", file);
  const response = await fetch("/api/coach/resume-original", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.original) throw Error(result.error || "原文件未保存，请重试；原简历未被覆盖");
  return result.original;
}
