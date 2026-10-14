"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resumePrintHtml, type PrintTemplate } from "@/lib/resume-print";
import styles from "./ResumePaper.module.css";

// CSS millimetres at 96dpi. The document never reflows to the surrounding rail.
export const RESUME_PAPER_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

export default function ResumePaper({ text, template, title = "简历成稿", showZoom = false, controlsBelow = false, highlight }: {
  text: string;
  template: PrintTemplate;
  title?: string;
  showZoom?: boolean;
  controlsBelow?: boolean;
  highlight?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const contentObserver = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(RESUME_PAPER_WIDTH);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  const [actualSize, setActualSize] = useState(false);
  const html = useMemo(() => resumePrintHtml(text, template, title, { toolbar: false, highlight }), [text, template, title, highlight]);
  const scale = actualSize ? 1 : Math.min(1, width / RESUME_PAPER_WIDTH);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(1, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); contentObserver.current?.disconnect(); };
  }, []);

  function measureContent() {
    contentObserver.current?.disconnect();
    const document = frame.current?.contentDocument;
    const main = document?.querySelector("main");
    if (!document || !main) return;
    const measure = () => {
      // Measure content, not iframe viewport height: otherwise resizing feeds back.
      const padding = 24 * 96 / 25.4;
      setHeight(Math.max(PAGE_HEIGHT, Math.ceil(main.getBoundingClientRect().height + padding)));
    };
    measure();
    void document.fonts.ready.then(measure);
    contentObserver.current = new ResizeObserver(measure);
    contentObserver.current.observe(main);
  }

  function revealHighlight() {
    setActualSize(true);
    requestAnimationFrame(() => frame.current?.contentDocument?.querySelector("[data-resume-highlight]")?.scrollIntoView({ block: "center", inline: "center" }));
  }
  const zoom = showZoom && <div className={styles.zoomControls} role="group" aria-label="简历阅读大小">
    <button type="button" aria-pressed={!actualSize} onClick={() => setActualSize(false)}>适合整页</button>
    <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(true)}>放大阅读 · 100%</button>
    {highlight && <button type="button" onClick={revealHighlight}>定位这处修改</button>}
  </div>;
  return <div className={styles.viewer}>
    {!controlsBelow && zoom}
    <div className={styles.viewport} ref={host}>
      <div className={styles.paperSize} style={{ width: RESUME_PAPER_WIDTH * scale, height: height * scale }}>
        <iframe ref={frame} className={styles.paper} title={title} sandbox="allow-same-origin" srcDoc={html}
          style={{ width: RESUME_PAPER_WIDTH, height, transform: `scale(${scale})` }} onLoad={measureContent} />
      </div>
    </div>
    {controlsBelow && zoom}
  </div>;
}
