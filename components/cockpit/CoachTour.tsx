"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import styles from "./CoachTour.module.css";

export type TourStep = {
  target?: string;
  title: string;
  body: string;
  mobile?: { target?: string; title?: string; body?: string } | false;
};

const CARD_WIDTH = 344;
const CARD_ESTIMATE_HEIGHT = 214;

export default function CoachTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const activeSteps = useMemo(() => (mobile ? steps.filter((item) => item.mobile !== false) : steps), [mobile, steps]);
  const current = Math.min(index, Math.max(activeSteps.length - 1, 0));
  const step = activeSteps[current];
  const mobileCopy = mobile && step?.mobile ? step.mobile : null;
  const title = mobileCopy?.title ?? step?.title ?? "";
  const body = mobileCopy?.body ?? step?.body ?? "";

  const measure = useCallback(() => {
    const narrow = window.innerWidth <= 760;
    setMobile(narrow);
    const selector = narrow && step?.mobile && step.mobile.target ? step.mobile.target : step?.target;
    const element = selector ? document.querySelector(selector) : null;
    if (!element) {
      setRect(null);
      return;
    }
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 });
  }, [step]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const previous = document.activeElement;
    const card = cardRef.current;
    return () => {
      // A user who leaves the guide to type owns their new focus.
      const focusStillInGuide = card?.contains(document.activeElement) || document.activeElement === document.body;
      if (focusStillInGuide && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => { cardRef.current?.focus({ preventScroll: true }); }, [current]);

  const next = useCallback(() => {
    setIndex(Math.min(current + 1, activeSteps.length - 1));
  }, [current, activeSteps.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (!cardRef.current?.contains(event.target as Node)) {
        return;
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (current === activeSteps.length - 1) onClose();
        else next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex(Math.max(current - 1, 0));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, activeSteps.length, next, onClose]);

  if (!step || typeof document === "undefined") return null;

  const dockTop = mobile && rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;
  const cardStyle: CSSProperties = mobile || !rect
    ? {}
    : (() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const spaceRight = viewportWidth - (rect.left + rect.width);
        if (spaceRight >= CARD_WIDTH + 32) {
          return { left: rect.left + rect.width + 18, top: Math.max(16, Math.min(rect.top, viewportHeight - CARD_ESTIMATE_HEIGHT - 16)) };
        }
        const below = rect.top + rect.height + 16;
        const top = below + CARD_ESTIMATE_HEIGHT < viewportHeight ? below : Math.max(16, rect.top - CARD_ESTIMATE_HEIGHT - 16);
        return { left: Math.max(16, Math.min(rect.left + rect.width / 2 - CARD_WIDTH / 2, viewportWidth - CARD_WIDTH - 16)), top };
      })();

  return createPortal(
    <div className={styles.root} data-mobile={mobile ? "true" : undefined} data-spotlight={rect ? "true" : undefined}>
      {rect && (
        <span
          className={styles.spotlight}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      )}
      <div
        key={`${mobile ? "m" : "d"}-${current}`}
        ref={cardRef}
        className={`${styles.card} ${mobile || !rect ? styles.cardDocked : ""} ${dockTop ? styles.cardDockedTop : ""}`}
        style={cardStyle}
        role="dialog"
        aria-labelledby="coach-tour-title"
        aria-describedby="coach-tour-body"
        tabIndex={-1}
      >
        <div className={styles.meta}>
          <span>{String(current + 1).padStart(2, "0")} / {String(activeSteps.length).padStart(2, "0")}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="跳过界面指引"><X size={14} /></button>
        </div>
        <h3 id="coach-tour-title">{title}</h3>
        <p id="coach-tour-body">{body}</p>
        <div className={styles.actions}>
          <div className={styles.dots} aria-hidden="true">{activeSteps.map((item, dot) => <i key={item.title} data-active={dot === current ? "true" : undefined} />)}</div>
          {current > 0 && <button type="button" className={styles.back} onClick={() => setIndex(Math.max(current - 1, 0))}>上一步</button>}
          <button type="button" className={styles.next} onClick={() => { if (current === activeSteps.length - 1) onClose(); else next(); }}>
            {current === activeSteps.length - 1 ? "开始使用" : "下一步"}<ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
