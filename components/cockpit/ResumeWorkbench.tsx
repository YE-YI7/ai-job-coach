"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, GripVertical, ShieldCheck } from "lucide-react";
import type { Opportunity, ResumeChange } from "@/lib/opportunities/types";
import { uncoverableGap } from "@/lib/opportunities/evidence-gaps";
import { splitResumeBlocks, assignChangesToBlocks, type ResumeBlockKind } from "@/lib/opportunities/resume-blocks";
import { markdownSegments } from "@/lib/opportunities/resume-markdown";
import { printTemplates, type PrintTemplate } from "@/lib/resume-print";
import { useResumeTemplate } from "@/lib/resume-template-preference";
import styles from "./CockpitApp.module.css";

// One resume = one sheet. Blocks are sections on that sheet, marked only by a
// hairline frame + a small kind dot — the board must read as a complete
// document page, not as scattered cards on a web page.
const KIND_META: Record<ResumeBlockKind, { label: string }> = {
  header: { label: "基本信息" },
  summary: { label: "个人简介" },
  education: { label: "教育" },
  experience: { label: "经历" },
  project: { label: "项目" },
  skill: { label: "技能" },
  other: { label: "内容" },
};

// 模板 = 导出的三套打印版式（经典黑白/简洁蓝灰/温润纸感），选完直接渲染在纸上。
const TEMPLATE_ORDER: PrintTemplate[] = ["classic", "modern", "warm"];
const TEMPLATE_CLASS: Record<PrintTemplate, string> = { classic: "sheetClassic", modern: "sheetModern", warm: "sheetWarm" };

// Replace each change's `before` inside a line with a pen-highlighted `after`.
// A change binds to the first line containing its `before`. Accepted / pending
// render the AI text (pen); rejected keep the original (struck through lightly).
function renderLine(line: string, pool: ResumeChange[], used: Set<string>): ReactNode {
  const applicable = pool.find((c) => !used.has(c.id) && c.before && line.includes(c.before));
  if (!applicable) return line;
  used.add(applicable.id);
  const idx = line.indexOf(applicable.before);
  const head = line.slice(0, idx);
  const tail = line.slice(idx + applicable.before.length);
  const showAfter = applicable.status !== "rejected";
  const text = showAfter ? applicable.after : applicable.before;
  return (
    <>
      {renderLine(head, pool, used)}
      <span className={showAfter ? styles.blockPen : styles.blockStrike} data-reason={applicable.reason} title={applicable.reason || undefined}>{text}</span>
      {renderLine(tail, pool, used)}
    </>
  );
}

// Markdown-authored resumes read as noise ("**字节跳动**", "## 项目经历"). The
// board renders the decoration instead of showing it: structural markers are
// dropped, **bold** becomes bold. resumeText itself stays byte-exact — this is
// display only; export/checks still see the original characters.
function renderMarkdownLine(line: string, pool: ResumeChange[], used: Set<string>): ReactNode {
  const segments = markdownSegments(line);
  if (segments.length === 1 && !segments[0].bold) return renderLine(segments[0].text, pool, used);
  return segments.map((segment, index) => segment.bold
    ? <strong key={index}>{renderLine(segment.text, pool, used)}</strong>
    : <span key={index}>{renderLine(segment.text, pool, used)}</span>);
}

export default function ResumeBlockBoard({ opportunity, onOpenEvidence, onUpdate, onEdit, onReorder }: {
  opportunity: Opportunity;
  onOpenEvidence: () => void;
  onUpdate: (id: string, status: "accepted" | "rejected") => void;
  onEdit: (id: string, after: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [template, chooseTemplate] = useResumeTemplate();

  const blocks = useMemo(
    () => assignChangesToBlocks(splitResumeBlocks(opportunity.resumeText || ""), opportunity.resumeChanges),
    [opportunity.resumeText, opportunity.resumeChanges],
  );

  const changeById = useMemo(() => new Map(opportunity.resumeChanges.map((c) => [c.id, c])), [opportunity.resumeChanges]);
  const usedIds = new Set<string>();

  const gap = useMemo(() => uncoverableGap(opportunity.requirements || []), [opportunity.requirements]);

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    // 顺序直接落回简历正文：保存、质检、冻结、导出用的都是重排后的文本。
    onReorder(dragId, targetId);
    setDragId(null);
  };
  const toggle = (id: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <>
      {gap && (
        <button type="button" className={styles.resumeGapNote} onClick={onOpenEvidence}>
          <ShieldCheck size={16} />
          <span>
            <strong>{gap.strength === "unverified" ? "有一处需要确认的硬要求" : "有一处真实短板"}</strong>
            <em>{gap.strength === "unverified" ? `「${gap.requirement}」还没有可核实的证据。` : `岗位看重「${gap.requirement}」，目前简历缺少对应经历。建议先补材料，而不是继续润色。`}</em>
          </span>
          <ChevronDown size={15} />
        </button>
      )}
      <div className={styles.blockToolbar}>
        <span><GripVertical size={13} className={styles.inlineGlyph} /> 拖动会按新顺序改写简历正文（保存与导出都会跟随），点击区块查看并修改每处改动。</span>
        <div className={styles.sheetTemplates} role="group" aria-label="简历模板">
          {TEMPLATE_ORDER.map((id) => (
            <button key={id} type="button" className={`${styles.sheetTemplateBtn} ${template === id ? styles.sheetTemplateBtnActive : ""}`} onClick={() => chooseTemplate(id)}>
              {printTemplates[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className={`${styles.resumeSheet} ${styles[TEMPLATE_CLASS[template]]}`}>
        {blocks.map((block) => {
          const meta = KIND_META[block.kind];
          const changes = block.changeIds.map((id) => changeById.get(id)).filter((c): c is ResumeChange => Boolean(c));
          const isExpanded = expanded.has(block.id);
          const pendingHere = changes.filter((c) => c.status === "pending").length;
          return (
            <section key={block.id} data-kind={block.kind} draggable={!block.synthetic}
              onDragStart={() => { if (!block.synthetic) setDragId(block.id); }} onDragOver={(e) => { if (!dragId || block.synthetic) return; e.preventDefault(); }} onDrop={() => reorder(block.id)} onDragEnd={() => setDragId(null)}
              className={`${styles.sheetSection} ${dragId === block.id ? styles.blockDragging : ""}`}>
              <header className={styles.blockHead} onClick={() => toggle(block.id)}>
                <GripVertical size={15} className={styles.blockGrip} aria-hidden="true" />
                <span className={styles.blockKind}>{meta.label}</span>
                <strong className={styles.blockTitle}>{block.title}</strong>
                {changes.length > 0 && <span className={styles.blockBadge}>{pendingHere ? `${pendingHere} 处待确认` : `${changes.length} 处改动`}</span>}
                <ChevronDown size={16} className={`${styles.blockChevron} ${isExpanded ? styles.blockChevronOpen : ""}`} />
              </header>
              <div className={styles.blockBody}>
                {block.lines.map((line, index) => <p key={index}>{renderMarkdownLine(line, changes, usedIds)}</p>)}
              </div>
              {isExpanded && (changes.length > 0 ? (
                <div className={styles.blockChanges}>
                  {changes.map((change) => (
                    <div key={change.id} className={styles.blockChange}>
                      <div className={styles.blockChangeHead}><span>{change.editedByUser ? "你的版本" : "AI 建议"}</span><em>{change.status === "accepted" ? "已采用" : change.status === "rejected" ? "保留原文" : "待确认"}</em></div>
                      {editingId === change.id
                        ? <textarea aria-label={`修改 ${change.section}`} value={editValue} maxLength={2000} rows={4} autoFocus onChange={(e) => setEditValue(e.target.value)} />
                        : <p className={styles.blockChangeText}>{change.after}</p>}
                      <p className={styles.blockChangeReason}>{change.reason}</p>
                      {editingId === change.id ? (
                        <div className={styles.blockChangeActions}>
                          <button className={styles.primaryButton} disabled={!editValue.trim()} onClick={() => { onEdit(change.id, editValue.trim()); setEditingId(null); setEditValue(""); }}><Check size={14} />保存我的修改</button>
                          <button className={styles.secondaryButton} onClick={() => { setEditingId(null); setEditValue(""); }}>取消</button>
                        </div>
                      ) : (
                        <div className={styles.blockChangeActions}>
                          {change.status === "pending" && <button className={styles.primaryButton} onClick={() => onUpdate(change.id, "accepted")}><Check size={14} />采用这版</button>}
                          <button className={styles.secondaryButton} onClick={() => { setEditingId(change.id); setEditValue(change.after); }}>自己修改</button>
                          {change.status !== "rejected" && <button className={styles.secondaryButton} onClick={() => onUpdate(change.id, "rejected")}>保留原文</button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : <p className={styles.blockNoChange}>这一块没有改动，无需逐条确认。</p>)}
            </section>
          );
        })}
      </div>
    </>
  );
}
