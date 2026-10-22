"use client";

import { type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import useQuotaLabel from "./useQuotaLabel";
import AgentConversation, { type CoachingStart, type ConversationAttempt } from "./AgentConversation";
import { ENTRY_DOORS, ENTRY_DOOR_BY_KIND, type EntryKind } from "@/lib/entry-doors";
import styles from "./StartDoors.module.css";

/**
 * The empty workspace starts here: four same-level doors, and only the input
 * belonging to the selected door expands. Nothing is sent until the person
 * presses the door's own submit button.
 */
export function StartDoors({ entry, onEntryChange, fileLostNotice, recovery, children, busy=false }: {
  entry: EntryKind;
  onEntryChange: (kind: EntryKind) => void;
  fileLostNotice?: boolean;
  recovery?: ReactNode;
  children?: ReactNode;
  busy?:boolean;
}) {
  const door = ENTRY_DOOR_BY_KIND[entry];
  return (
    <section className={styles.start} aria-label="选择起点">
      <div className={styles.lead}>
        <h1>先选你手里有什么</h1>
        <p>选一个起点，只展开对应的那一个输入。没点开始之前不会调用模型，也不会占用额度。</p>
      </div>
      <div className={styles.doors} role="group" aria-label="四种起点">
        {ENTRY_DOORS.map((item) => (
          <button
            type="button"
            key={item.kind}
            disabled={busy}
            className={styles.door}
            aria-pressed={entry === item.kind}
            onClick={() => onEntryChange(item.kind)}
          >
            <span className={styles.index}>{item.index}</span>
            <strong>{item.title}</strong>
            <span className={styles.desc}>{item.desc}</span>
          </button>
        ))}
      </div>
      <div className={styles.panel} key={entry} aria-busy={busy}>
        <div className={styles.panelHead}>
          <span className={styles.panelMeta}>{door.meta}</span>
          <p className={styles.panelOut}>这一步会得到：{door.out}</p>
        </div>
        {fileLostNotice && <p className={styles.fileLost} role="status">刷新后浏览器留不住刚才选的文件，文字草稿还在；需要文件请重新选一次。</p>}
        {children}
      </div>
      {recovery}
    </section>
  );
}

/** Doors 3–4 after submit: the existing mentor conversation, without an opportunity. */
export function StartConversation({ kind, startRequest, onConsumed, onAttempt, onBack, enabled = true }: {
  kind: EntryKind;
  startRequest: CoachingStart | null;
  onConsumed: (id: string) => void;
  onAttempt?: (attempt: ConversationAttempt) => void;
  onBack: () => void;
  enabled?: boolean;
}) {
  const door = ENTRY_DOOR_BY_KIND[kind];
  return (
    <section className={styles.chatSurface} aria-label="导师对话">
      <div className={styles.chatBar}>
        <button type="button" className={styles.chatBack} onClick={onBack}>← 换一个起点</button>
        <span className={styles.chatHint}>{door.out}</span>
      </div>
      <div className={styles.chatMount}>
        <AgentConversation label={door.title} startRequest={startRequest} onStartConsumed={onConsumed} onAttempt={onAttempt} enabled={enabled} />
      </div>
    </section>
  );
}

/** Doors 3–4: one editable sentence, handed to the mentor conversation on submit. */
export function ChatStartDoor({ kind, text, onChange, onStart, disabled = false }: {
  kind: EntryKind;
  text: string;
  onChange: (value: string) => void;
  onStart: (value: string) => void;
  disabled?: boolean;
}) {
  const door = ENTRY_DOOR_BY_KIND[kind];
  const quotaLabel = useQuotaLabel("chat");
  return (
    <form
      className={styles.chatForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim() || disabled) return;
        onStart(text.trim());
      }}
    >
      <textarea
        value={text}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        maxLength={4000}
        disabled={disabled}
        placeholder={door.placeholder}
        aria-label={door.title}
        autoFocus
      />
      {door.chips.length > 0 && (
        <div className={styles.chips} role="group" aria-label="例句带入，选中后可以再改">
          <span className={styles.chipsLabel}>也可以点一句带入</span>
          {door.chips.map((chip) => (
            <button type="button" key={chip} disabled={disabled} onClick={() => onChange(chip)}>{chip}</button>
          ))}
        </div>
      )}
      <div className={styles.chatFoot}>
        <span>这段话会原样作为你的第一句发给导师，发送前一直可以改。</span>
        <button type="submit" disabled={!text.trim() || disabled}>{door.cta} · {quotaLabel}<ArrowRight size={16} /></button>
      </div>
    </form>
  );
}
