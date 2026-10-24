"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { ENTRY_DOORS, ENTRY_DOOR_BY_KIND, intakeEntryFor, type EntryKind, type IntakeEntry } from "@/lib/entry-doors";
import AgentConversation, { type CoachingStart } from "./AgentConversation";
import CompanionStart from "./CompanionStart";
import WorkspaceAccount from "./WorkspaceAccount";
import styles from "./EntryWorkspace.module.css";

export default function EntryWorkspace({ initialEntry, accountLabel, scope, live, onMaterial, onBack, onLogout }: {
  initialEntry?: EntryKind;
  accountLabel: string;
  scope: string;
  live: boolean;
  onMaterial: (entry: IntakeEntry) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [selected, setSelected] = useState<EntryKind | null>(initialEntry ?? null);
  function choose(kind: EntryKind) {
    const material = intakeEntryFor(kind);
    if (material) { onMaterial(material); return; }
    setSelected(kind);
  }
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><Image src="/logo.png" alt="" width={34} height={34} />益职 AI</Link>
      <WorkspaceAccount label={accountLabel} live={live} onLogout={onLogout} />
    </header>
    <section className={styles.content} aria-label="选择起点">
      <button type="button" className={styles.back} onClick={() => { setSelected(null); onBack(); }}>
        <ArrowLeft size={16} />{selected ? "换一个起点" : "返回工作区"}
      </button>
      <h1>从你手里有的开始</h1>
      <p className={styles.lead}>简历、岗位，或只有一句困惑都可以。选一个起点，不需要把所有材料准备齐。</p>
      <div className={styles.choices} role="group" aria-label="四种起点">
        {ENTRY_DOORS.map(door => <button type="button" key={door.kind}
          aria-pressed={selected === door.kind} onClick={() => choose(door.kind)}>
          <strong>{door.title}</strong><span>{door.desc}</span>
        </button>)}
      </div>
      {!selected && <p className={styles.note}>选择起点不会调用模型或消耗额度。</p>}
      {selected === "one_sentence" && <div className={styles.panel}>
        <CompanionStart onResume={() => onMaterial("direction")} onInterview={() => onMaterial("interview")} />
      </div>}
      {selected === "find_jobs" && <FindJobsStart enabled={live} scope={scope} />}
      <Link className={styles.recovery} href="/account/phone?recover=1">以前用过益职？找回原来的工作区 →</Link>
    </section>
  </main>;
}

function subscribeToDraft(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function FindJobsStart({ enabled, scope }: { enabled: boolean; scope: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [request, setRequest] = useState<CoachingStart | null>(null);
  const [started, setStarted] = useState(false);
  const door = ENTRY_DOOR_BY_KIND.find_jobs;
  const draftKey = `yi-zhi:find-jobs-entry:${scope}`;
  const readDraft = useCallback(() => {
    try { return sessionStorage.getItem(draftKey) || ""; } catch { return ""; }
  }, [draftKey]);
  const readStarted = useCallback(() => {
    try { return sessionStorage.getItem(`${draftKey}:started`) || ""; } catch { return ""; }
  }, [draftKey]);
  const restored = useSyncExternalStore(subscribeToDraft, readDraft, () => "");
  const restoredStarted = useSyncExternalStore(subscribeToDraft, readStarted, () => "");
  const text = draft ?? restored;
  function changeText(value: string) {
    setDraft(value);
    try { sessionStorage.setItem(draftKey, value); } catch { /* The text remains in this page. */ }
  }
  return <div className={styles.panel}>
    {!(started || restoredStarted === "1") ? <form onSubmit={event => {
      event.preventDefault();
      if (!text.trim() || !enabled) return;
      setRequest({ id: crypto.randomUUID(), title: "找岗位", prompt: text.trim() });
      setStarted(true);
      try { sessionStorage.setItem(`${draftKey}:started`, "1"); } catch { /* Existing chat history is still saved by the server. */ }
    }}>
      <label htmlFor="entry-find-jobs">先说说方向和要求；还不清楚也可以直接说。</label>
      <textarea id="entry-find-jobs" value={text} onChange={event => changeText(event.target.value)}
        maxLength={4000} rows={4} placeholder={door.placeholder} />
      <div className={styles.suggestions}>{door.chips.map(chip => <button type="button" key={chip}
        onClick={() => changeText(chip)}>{chip}</button>)}</div>
      <button className={styles.submit} type="submit" disabled={!enabled || !text.trim()}>
        {door.cta}<ArrowUp size={17} />
      </button>
      <p className={styles.note}>提交后由导师澄清条件，资料足够再找岗位。AI 操作按当前模型档位使用额度。</p>
      {!enabled && <p className={styles.note}>当前为虚构预览，不会发送消息；登录后可以继续。</p>}
    </form> : <AgentConversation label="找岗位" enabled={enabled}
      startRequest={request} onStartConsumed={() => setRequest(null)} />}
  </div>;
}
