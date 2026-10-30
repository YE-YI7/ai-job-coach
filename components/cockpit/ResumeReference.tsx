"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MessageSquareQuote, X } from "lucide-react";
import {
  makeResumeReference,
  parseResumeReference,
  referencePointer,
  resolveResumeReference,
  sameResumeReference,
  type ResumeReference,
  type ResumeReferenceSource,
  type ResolvedResumeReference,
} from "@/lib/opportunities/resume-reference";
import styles from "./ResumeReference.module.css";

type Selection = {
  key: string;
  pointer: ResumeReference;
  preview?: ResolvedResumeReference;
  error?: string;
  nonce: number;
};
type ReferenceControl = {
  selection: Selection | null;
  quote: (changeId: string) => Promise<void>;
  clear: (expected?: ResumeReference) => void;
};
const Reference = createContext<ReferenceControl | null>(null);
export const useResumeReference = () => useContext(Reference);
export function ResumeReferenceProvider({
  source,
  owner,
  onQuote,
  children,
}: {
  source?: ResumeReferenceSource;
  owner: string;
  onQuote?: () => void;
  children: ReactNode;
}) {
  const key = source
    ? `yizhi:resume-reference:v1:${encodeURIComponent(owner)}:${source.id}`
    : "";
  const currentKey = useRef(key);
  const currentSource = useRef(source);
  const operation = useRef(0);
  useLayoutEffect(() => {
    currentKey.current = key;
    currentSource.current = source;
  }, [key, source]);
  const [stored, setStored] = useState<Selection | null>(null);
  // Only IDs and hashes are stored, never résumé text. Scope is account + document.
  useEffect(() => {
    if (!source || !key) return;
    let cancelled = false;
    const token = ++operation.current;
    const restore = async () => {
      let pointer: ResumeReference;
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        pointer = parseResumeReference(JSON.parse(raw));
      } catch {
        return;
      }
      try {
        const preview = await resolveResumeReference(pointer, source);
        if (!cancelled && operation.current === token)
          setStored({ key, pointer, preview, nonce: 0 });
      } catch (cause) {
        if (!cancelled && operation.current === token)
          setStored({
            key,
            pointer,
            nonce: 0,
            error:
              cause instanceof Error
                ? cause.message
                : "引用已变化，请重新点选。",
          });
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [key, source]);
  const selection = stored?.key === key ? stored : null;
  const latestSelection = useRef(selection);
  useLayoutEffect(() => {
    latestSelection.current = selection;
  }, [selection]);
  const quote = async (changeId: string) => {
    if (!source) return;
    const token = ++operation.current;
    const preview = await makeResumeReference(source, changeId);
    if (currentKey.current !== key || operation.current !== token) return;
    if (currentSource.current !== source)
      throw new Error("简历已更新，请重新引用这处修改。");
    const pointer = referencePointer(preview);
    try {
      sessionStorage.setItem(key, JSON.stringify(pointer));
    } catch {
      /* Current visit remains usable. */
    }
    setStored({ key, pointer, preview, nonce: Date.now() });
    onQuote?.();
  };
  const clear = (expected?: ResumeReference) => {
    if (
      currentKey.current !== key ||
      (expected &&
        !sameResumeReference(latestSelection.current?.pointer, expected))
    )
      return;
    ++operation.current;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* In-memory removal still works. */
    }
    setStored(null);
  };
  return (
    <Reference.Provider value={{ selection, quote, clear }}>
      {children}
    </Reference.Provider>
  );
}
export function ResumeReferencePreview({
  reference,
}: {
  reference: ResolvedResumeReference;
}) {
  return (
    <blockquote className={styles.preview}>
      <strong>{reference.section || "引用这处修改"}</strong>
      <p>原文：{reference.before.slice(0, 400)}</p>
      {reference.after !== reference.before && (
        <p>
          建议：
          {reference.after ? reference.after.slice(0, 400) : "删除这处文字"}
        </p>
      )}
    </blockquote>
  );
}
export function ResumeReferenceDraft() {
  const control = useResumeReference();
  const selected = control?.selection;
  if (!selected) return null;
  return (
    <div className={styles.draft} role="group" aria-label="已引用的简历修改">
      <div className={styles.label}>
        <MessageSquareQuote size={16} aria-hidden="true" />
        <span>已引用 · 不会自动发送</span>
        <button
          type="button"
          aria-label="移除引用"
          onClick={() => control.clear()}
        >
          <X size={16} />
        </button>
      </div>
      {selected.error ? (
        <p role="alert">{selected.error}</p>
      ) : (
        selected.preview && (
          <ResumeReferencePreview reference={selected.preview} />
        )
      )}
    </div>
  );
}
