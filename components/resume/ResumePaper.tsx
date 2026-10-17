"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { resumePrintHtml, type PrintTemplate } from "@/lib/resume-print";
import styles from "./ResumePaper.module.css";
import type { ResumeInk } from "@/lib/opportunities/resume-inline";

// CSS millimetres at 96dpi. The document never reflows to the surrounding rail.
export const RESUME_PAPER_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

export default function ResumePaper({ text, template, title = "简历成稿", showZoom = false, controlsBelow = false, highlight, review, inlineEditor }: {
  text: string;
  template: PrintTemplate;
  title?: string;
  showZoom?: boolean;
  controlsBelow?: boolean;
  highlight?: string;
  inlineEditor?: { blockId: string; content: ReactNode };
  review?: { ink: ResumeInk[]; blockIds: string[]; onMark: (id: string, rect: {left:number;top:number;bottom:number}, interaction:{keyboard:boolean;restoreFocus:()=>void}) => void; onReorder: (from: string, to: string) => void; onDismiss?:(restoreFocus?:boolean)=>void; onEditBlock?:(id:string,restoreFocus?:()=>void)=>void; disabled?:boolean };
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const contentObserver = useRef<ResizeObserver | null>(null);
  const contentCleanup = useRef<(() => void) | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const expectedDocument = useRef("");
  const restoreEditorFocus = useCallback(() => {
    const document = frame.current?.contentDocument;
    // srcDoc changes asynchronously: a complete *previous* Document must not
    // consume the focus receipt before the new document has loaded.
    if (!pendingFocus.current || document?.readyState !== "complete" || document.documentElement.dataset.resumeRender !== expectedDocument.current) return;
    const section = document.querySelector<HTMLElement>(`section[data-resume-block="${CSS.escape(pendingFocus.current)}"]`);
    const control = section?.querySelector<HTMLButtonElement>(".resume-edit") || document.querySelector<HTMLButtonElement>(".resume-edit");
    if (control) { control.focus({preventScroll:true}); pendingFocus.current = null; }
  }, []);
  const reviewRef = useRef(review);
  useEffect(()=>{reviewRef.current=review;},[review]);
  const [width, setWidth] = useState(RESUME_PAPER_WIDTH);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  const [actualSize, setActualSize] = useState(false);
  const [mobile,setMobile]=useState(false);
  // srcDoc navigation may expose a document before its sections are ready.
  // A load receipt always rerenders the portal, even if the Document identity
  // was already observed by the hydration fallback.
  const [loadedFrame, setLoadedFrame] = useState<{document: Document} | null>(null);
  const loadedDocument = loadedFrame?.document;
  const editorBlockId = inlineEditor?.blockId;
  const previousEditorBlock = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const previous = previousEditorBlock.current;
    previousEditorBlock.current = editorBlockId;
    // Restored drafts intentionally contain no old DOM callbacks. The current
    // iframe owns focus on every close, including after a view remount.
    if (previous && !editorBlockId) {
      pendingFocus.current = previous;
    }
  }, [editorBlockId]);
  const editTarget = editorBlockId && loadedDocument?.querySelector<HTMLElement>(`section[data-resume-block="${CSS.escape(editorBlockId)}"]`);
  useLayoutEffect(() => {
    if (!editTarget) return;
    editTarget.dataset.inlineEditing = "true";
    return () => { delete editTarget.dataset.inlineEditing; };
  }, [editTarget]);
  const reading=Boolean(review)&&mobile&&!actualSize;
  const paperWidth=reading?Math.max(280,width):RESUME_PAPER_WIDTH;
  const ink=review?.ink,interactive=Boolean(review);
  const html = useMemo(() => resumePrintHtml(text, template, title, { toolbar: false, highlight, ink, interactive, reading }), [text, template, title, highlight, ink, interactive,reading]);
  const frameHtml = useMemo(() => {
    let fingerprint = 2166136261;
    for (let index = 0; index < html.length; index++) fingerprint = Math.imul(fingerprint ^ html.charCodeAt(index), 16777619);
    const key = (fingerprint >>> 0).toString(36);
    return { key, source: html.replace('<html lang="zh-CN"', `<html lang="zh-CN" data-resume-render="${key}"`) };
  }, [html]);
  useLayoutEffect(() => { expectedDocument.current = frameHtml.key; }, [frameHtml.key]);
  const scale = actualSize||reading ? 1 : Math.min(1, width / RESUME_PAPER_WIDTH);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {setWidth(Math.max(1, element.clientWidth));setMobile(window.innerWidth<700);};
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
    main.querySelectorAll('.resume-grip,.resume-edit').forEach(grip=>grip.remove());
    const measure = () => {
      // Measure content, not iframe viewport height: otherwise resizing feeds back.
      const padding = 24 * 96 / 25.4;
      setHeight(Math.max(PAGE_HEIGHT, Math.ceil(main.getBoundingClientRect().height + padding)));
    };
    measure();
    void document.fonts.ready.then(measure);
    contentObserver.current = new ResizeObserver(measure);
    contentObserver.current.observe(main);
    if (reviewRef.current && !reviewRef.current.disabled) {
      let returningFocus=false;
      const activate=(event:Event)=>{
        if((event.target as HTMLElement).closest('.resume-live-editor'))return;
        if(event.type==='keydown'&&(event as KeyboardEvent).key==='Escape'){reviewRef.current?.onDismiss?.();return;}
        if(returningFocus||reviewRef.current?.disabled)return;
        const target=event.target as HTMLElement, mark=target.closest<HTMLElement>("[data-change-id]");
        if(!mark){if(event.type==='click')reviewRef.current?.onDismiss?.(false);return;}
        if(event.type==='keydown'&&!['Enter',' '].includes((event as KeyboardEvent).key))return;
        if(event.type==='click'||event.type==='keydown')event.preventDefault();
        const outer=frame.current!.getBoundingClientRect(),r=mark.getBoundingClientRect(),ratio=outer.width/(document.documentElement.clientWidth||RESUME_PAPER_WIDTH);
        const restoreFocus=()=>{returningFocus=true;if(mark.isConnected)mark.focus();else frame.current?.focus();returningFocus=false;};
        reviewRef.current?.onMark(mark.dataset.changeId!,{left:outer.left+r.left*ratio,top:outer.top+r.top*ratio,bottom:outer.top+r.bottom*ratio},{keyboard:event.type==='focusin'||event.type==='keydown',restoreFocus});
      };
      for(const name of ['mouseover','focusin','click','keydown'])main.addEventListener(name,activate);
      const sections=Array.from(main.querySelectorAll<HTMLElement>('section[data-resume-block]'));
      const selectSection=(event:Event)=>{
        const target=event.target as HTMLElement;
        if(target.closest('button,a,[data-change-id],.resume-live-editor'))return;
        const selected=target.closest<HTMLElement>('section[data-resume-block]');
        sections.forEach(section=>{if(section===selected)section.dataset.editingActive='true';else delete section.dataset.editingActive;});
      };
      main.addEventListener('click',selectSection);
      const ids=reviewRef.current.blockIds;
      let moving:string|null=null;
      let showHint=false;
      try{showHint=sections.length>1&&!localStorage.getItem('yizhi:resume-drag-hint:v1');if(showHint)localStorage.setItem('yizhi:resume-drag-hint:v1','seen');}catch{/* 隐私模式下不重复播放提示。 */}
      sections.forEach((section,index)=>{
        const id=section.dataset.resumeBlock!;
        if(!ids.includes(id))return;
        if(reviewRef.current?.onEditBlock){
          const edit=document.createElement('button');edit.type='button';edit.className='resume-edit';edit.textContent='编辑';edit.setAttribute('aria-label',`编辑${section.querySelector('h2,h3')?.textContent||'这段文字'}`);
          edit.addEventListener('click',()=>reviewRef.current?.onEditBlock?.(id));section.prepend(edit);
        }
        if(section.dataset.kind==='header')return;
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
      contentCleanup.current=()=>{for(const name of ['mouseover','focusin','click','keydown'])main.removeEventListener(name,activate);main.removeEventListener('click',selectSection);};
    }
  }, []);

  useEffect(() => {
    // srcDoc can finish loading before React hydrates and attaches onLoad.
    // Bind the already-loaded document too, including after a markup refresh.
    let focusTick = 0;
    const tick = requestAnimationFrame(() => {
      const document = frame.current?.contentDocument;
      if (document?.readyState === 'complete' && document.querySelector('main')) setLoadedFrame({document});
      measureContent();
      // Bind both hydration and srcDoc controls before returning focus. A
      // second frame avoids focusing a button that measureContent replaces.
      focusTick = requestAnimationFrame(restoreEditorFocus);
    });
    return () => { cancelAnimationFrame(tick); cancelAnimationFrame(focusTick); };
  }, [html, editorBlockId, measureContent, restoreEditorFocus, review?.disabled]);

  function revealHighlight() {
    setActualSize(true);
    requestAnimationFrame(() => frame.current?.contentDocument?.querySelector("[data-resume-highlight]")?.scrollIntoView({ block: "center", inline: "center" }));
  }
  const zoom = showZoom && <div className={styles.zoomControls} role="group" aria-label="简历阅读大小">
    <button type="button" aria-pressed={!actualSize} onClick={() => setActualSize(false)}>{mobile&&review?'阅读视图':'适合整页'}</button>
    <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(true)}>A4 原尺寸</button>
    {highlight && <button type="button" onClick={revealHighlight}>定位这处修改</button>}
  </div>;
  return <div className={`${styles.viewer} ${review ? styles.reviewViewer : ""}`}>
    {!controlsBelow && zoom}
    <div className={styles.viewport} ref={host}>
      <div className={styles.paperSize} style={{ width: paperWidth * scale, height: height * scale }}>
        <iframe ref={frame} className={styles.paper} title={title} sandbox="allow-same-origin" srcDoc={frameHtml.source}
          style={{ width: paperWidth, height, transform: `scale(${scale})` }} onLoad={() => { const document=frame.current?.contentDocument; if(document)setLoadedFrame({document}); measureContent(); requestAnimationFrame(restoreEditorFocus); }} />
      </div>
    </div>
    {controlsBelow && zoom}
    {reading&&<p className={styles.readingNote}>阅读视图 · 导出仍按 A4 排版</p>}
    {inlineEditor && editTarget && createPortal(inlineEditor.content, editTarget)}
  </div>;
}
