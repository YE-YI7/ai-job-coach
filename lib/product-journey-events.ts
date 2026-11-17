/** 只记录流程编号和有限状态，不收集简历、问题、模型回复或链接。 */
export const LANDING_JOURNEY_EVENTS = [
  "landing_message_submitted", "landing_response_presented", "landing_continued",
] as const;
export const RESUME_EXPORT_EVENTS = [
  "resume_export_clicked", "resume_export_cancelled", "resume_preview_ready", "resume_preview_failed",
  "resume_print_requested", "resume_print_failed", "resume_print_dialog_closed",
] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const generation = /^[a-f0-9-]{36}:\d{1,12}$/i;
const token = /^[a-zA-Z0-9_-]{1,96}$/;
export function isLandingJourneyEvent(name: string) {
  return (LANDING_JOURNEY_EVENTS as readonly string[]).includes(name);
}
export function isResumeExportEvent(name: string) {
  return (RESUME_EXPORT_EVENTS as readonly string[]).includes(name);
}
export function prepareJourneyEvent(name: string, properties: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null> = { schema_version: 2 };
  if (isLandingJourneyEvent(name)) {
    if (typeof properties.journey_id !== "string" || !uuid.test(properties.journey_id)) return null;
    safe.journey_id = properties.journey_id;
    if (["model", "fallback"].includes(String(properties.response_source))) {
      safe.response_source = String(properties.response_source);
    }
    if (["fresh", "restored", "link"].includes(String(properties.entry_source))) {
      safe.entry_source = String(properties.entry_source);
    }
    return safe;
  }
  if (!isResumeExportEvent(name)) return null;
  for (const key of ["export_id", "opportunity_id", "artifact_id"] as const) {
    if (typeof properties[key] === "string" && uuid.test(properties[key])) safe[key] = properties[key];
  }
  if (properties.generation_id != null) {
    if (typeof properties.generation_id !== "string" || !generation.test(properties.generation_id)) return null;
    safe.generation_id = properties.generation_id;
  }
  // 历史导出没有代号时仍记录操作，但不补造与某次改稿的关联。
  safe.linkage = safe.generation_id ? "generation" : "unlinked";
  for (const key of ["template", "version_source", "failure_stage", "resume_revision"] as const) {
    if (typeof properties[key] === "string" && token.test(properties[key])) safe[key] = properties[key];
  }
  if (Number.isInteger(properties.pending_count) && Number(properties.pending_count) >= 0) {
    safe.pending_count = Math.min(Number(properties.pending_count), 10000);
  }
  return safe;
}
