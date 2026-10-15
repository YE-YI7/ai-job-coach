"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resumePrintHtml, type PrintTemplate } from "@/lib/resume-print";
import styles from "./ResumePaper.module.css";
import type { ResumeInk } from "@/lib/opportunities/resume-inline";

// CSS millimetres at 96dpi. The document never reflows to the surrounding rail.
export const RESUME_PAPER_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

export default function ResumePaper({ text, template, title = "简历成稿", showZoom = false, controlsBelow = false, highlight, review }: {
  text: string;
  template: PrintTemplate;
  title?: string;
  showZoom?: boolean;
  controlsBelow?: boolean;
  highlight?: string;
  review?: { ink: ResumeInk[]; blockIds: string[]; onMark: (id: string, rect: {left:number;top:number;bottom:number}, interaction:{keyboard:boolean;restoreFocus:()=>void}) => void; onReorder: (from: string, to: string) => void; onDismiss?:()=>void };
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const contentObserver = useRef<ResizeObserver | null>(null);
  const contentCleanup = useRef<(() => void) | null>(null);
  const reviewRef = useRef(review);
  useEffect(()=>{reviewRef.current=review;},[review]);
  const [width, setWidth] = useState(RESUME_PAPER_WIDTH);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  const [actualSize, setActualSize] = useState(false);
  const ink=review?.ink,interactive=Boolean(review);
  const html = useMemo(() => resumePrintHtml(text, template, title, { toolbar: false, highlight, ink, interactive }), [text, template, title, highlight, ink, interactive]);
  const scale = actualSize ? 1 : Math.min(1, width / RESUME_PAPER_WIDTH);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(1, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); contentObserver.current?.disconnect();contentCleanup.current?.(); };
  }, []);

  const measureContent = useCallback(() => {
    contentObserver.current?.disconnect();
    contentCleanup.current?.();
    const document = frame.current?.contentDocument;
    const main = document?.querySelector("main");
    if (!document || !main) return;
    main.querySelectorAll('.resume-grip').forEach(grip=>grip.remove());
    const measure = () => {
      // Measure content, not iframe viewport height: otherwise resizing feeds back.
      const padding = 24 * 96 / 25.4;
      setHeight(Math.max(PAGE_HEIGHT, Math.ceil(main.getBoundingClientRect().height + padding)));
    };
    measure();
    void document.fonts.ready.then(measure);
    contentObserver.current = new ResizeObserver(measure);
    contentObserver.current.observe(main);
    if (reviewRef.current) {
      let returningFocus=false;
      const activate=(event:Event)=>{
        if(event.type==='keydown'&&(event as KeyboardEvent).key==='Escape'){reviewRef.current?.onDismiss?.();return;}
        if(returningFocus)return;
        const target=event.target as HTMLElement, mark=target.closest<HTMLElement>("[data-change-id]");
        if(!mark)return;
        if(event.type==='keydown'&&!['Enter',' '].includes((event as KeyboardEvent).key))return;
        if(event.type==='click'||event.type==='keydown')event.preventDefault();
        const outer=frame.current!.getBoundingClientRect(),r=mark.getBoundingClientRect(),ratio=outer.width/RESUME_PAPER_WIDTH;
        const restoreFocus=()=>{returningFocus=true;if(mark.isConnected)mark.focus();else frame.current?.focus();returningFocus=false;};
        reviewRef.current?.onMark(mark.dataset.changeId!,{left:outer.left+r.left*ratio,top:outer.top+r.top*ratio,bottom:outer.top+r.bottom*ratio},{keyboard:event.type==='focusin'||event.type==='keydown',restoreFocus});
      };
      for(const name of ['mouseover','focusin','click','keydown'])main.addEventListener(name,activate);
      const sections=Array.from(main.querySelectorAll<HTMLElement>('section[data-resume-block]'));
      const ids=reviewRef.current.blockIds;
      let moving:string|null=null;
      let showHint=false;
      try{showHint=sections.length>1&&!localStorage.getItem('yizhi:resume-drag-hint:v1');if(showHint)localStorage.setItem('yizhi:resume-drag-hint:v1','seen');}catch{/* 隐私模式下不重复播放提示。 */}
      sections.forEach((section,index)=>{
        const id=section.dataset.resumeBlock!;
        if(!ids.includes(id)||section.dataset.kind==='header')return;
        const grip=document.createElement('button');grip.type='button';grip.className='resume-grip';grip.draggable=true;
        grip.title='拖动调整顺序 · Alt + 方向键';grip.setAttribute('aria-label',`调整${section.querySelector('h2,h3')?.textContent||'简历区块'}顺序`);
        grip.innerHTML='<svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="5" r="1"/><circle cx="10" cy="5" r="1"/><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="4" cy="15" r="1"/><circle cx="10" cy="15" r="1"/></svg>';
        if(showHint){grip.dataset.hint='true';showHint=false;}
        grip.addEventListener('dragstart',event=>{moving=id;event.dataTransfer?.setData('text/plain',id);});
        grip.addEventListener('dragend',()=>{moving=null;});
        section.addEventListener('dragover',event=>{if(moving&&moving!==id)event.preventDefault();});
        section.addEventListener('drop',event=>{if(moving&&moving!==id){event.preventDefault();reviewRef.current?.onReorder(moving,id);}moving=null;});
        grip.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;const target=sections[index+(event.key==='ArrowUp'?-1:1)];if(target&&target.dataset.kind!=='header'&&ids.includes(target.dataset.resumeBlock!)){event.preventDefault();reviewRef.current?.onReorder(id,target.dataset.resumeBlock!);}});
        section.prepend(grip);
      });
      contentCleanup.current=()=>{for(const name of ['mouseover','focusin','click','keydown'])main.removeEventListener(name,activate);};
    }
  }, []);

  useEffect(() => {
    // srcDoc can finish loading before React hydrates and attaches onLoad.
    // Bind the already-loaded document too, including after a markup refresh.
    measureContent();
  }, [html, measureContent]);

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
