"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, GripVertical, ShieldCheck } from "lucide-react";
import type { Opportunity, RequirementEvidence, ResumeChange } from "@/lib/opportunities/types";
import { splitResumeBlocks, assignChangesToBlocks, type ResumeBlockKind } from "@/lib/opportunities/resume-blocks";
import { markdownSegments } from "@/lib/opportunities/resume-markdown";
import styles from "./CockpitApp.module.css";

// Per-kind palette: a distinct border + background so each section reads as its
// own card (教育/项目/实习 each one card, different colours), per the design ask.
const KIND_META: Record<ResumeBlockKind, { label: string; className: string }> = {
  header: { label: "基本信息", className: "blockHeader" },
  summary: { label: "个人简介", className: "blockSummary" },
  education: { label: "教育", className: "blockEducation" },
  experience: { label: "经历", className: "blockExperience" },
  project: { label: "项目", className: "blockProject" },
  skill: { label: "技能", className: "blockSkill" },
  other: { label: "内容", className: "blockOther" },
};

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

  const blocks = useMemo(
    () => assignChangesToBlocks(splitResumeBlocks(opportunity.resumeText || ""), opportunity.resumeChanges),
    [opportunity.resumeText, opportunity.resumeChanges],
  );

  const changeById = useMemo(() => new Map(opportunity.resumeChanges.map((c) => [c.id, c])), [opportunity.resumeChanges]);
  const usedIds = new Set<string>();

  const gap = useMemo<RequirementEvidence | null>(() => {
    const reqs = opportunity.requirements || [];
    return reqs.find((r) => r.importance === "critical" && (r.strength === "missing" || r.strength === "unverified"))
      || reqs.find((r) => r.strength === "missing") || null;
  }, [opportunity.requirements]);

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
        <span><GripVertical size={13} className={styles.inlineGlyph} /> 拖动会按新顺序改写简历正文（保存与导出都会跟随），点击卡片查看并修改每处改动。</span>
      </div>
      <div className={styles.blockList}>
        {blocks.map((block) => {
          const meta = KIND_META[block.kind];
          const changes = block.changeIds.map((id) => changeById.get(id)).filter((c): c is ResumeChange => Boolean(c));
          const isExpanded = expanded.has(block.id);
          const pendingHere = changes.filter((c) => c.status === "pending").length;
          return (
            <article key={block.id} draggable={!block.synthetic}
              onDragStart={() => { if (!block.synthetic) setDragId(block.id); }} onDragOver={(e) => { if (!dragId || block.synthetic) return; e.preventDefault(); }} onDrop={() => reorder(block.id)} onDragEnd={() => setDragId(null)}
              className={`${styles.resumeBlock} ${styles[meta.className]} ${dragId === block.id ? styles.blockDragging : ""}`}>
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
            </article>
          );
        })}
      </div>
    </>
  );
}
