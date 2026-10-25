/** Reuse the bundled, OFL-licensed face. OS Songti aliases 口 to a Kangxi
 * radical glyph, which Chrome may reverse-map incorrectly in PDF ToUnicode. */
export const RESUME_SERIF_FAMILY = 'YiZhi Resume Serif';
export const RESUME_SERIF_PATH = '/fonts/source-han-serif-home.woff2';

export async function readyResumePrintFonts(document: Document, serif: boolean) {
  if (!document.fonts) throw new Error('font_loading_unavailable');
  if (serif) {
    const faces = await document.fonts.load(`10.5pt "${RESUME_SERIF_FAMILY}"`);
    if (!faces.length) throw new Error('resume_font_unavailable');
  }
  await document.fonts.ready;
}

export function bindResumePrintAction(target: Window, serif: boolean, onPrintRequested?: () => void) {
  const button = target.document.getElementById('print') as HTMLButtonElement | null;
  const status = target.document.getElementById('print-status');
  if (!button) return;
  let ready = false;
  let loading: Promise<boolean> | null = null;
  const prepare = (): Promise<boolean> => {
    if (loading) return loading;
    button.disabled = true;
    if (status) status.textContent = '正在准备打印字体…';
    loading = readyResumePrintFonts(target.document, serif).then(() => {
      ready = true;
      button.textContent = '保存为 PDF';
      if (status) status.textContent = '字体已就绪，正文可选中、搜索。';
      return true;
    }).catch(() => {
      ready = false;
      button.textContent = '重试准备字体';
      if (status) status.textContent = '打印字体未加载，请检查网络后重试；简历正文没有变化。';
      return false;
    }).finally(() => { button.disabled = false; loading = null; });
    return loading;
  };
  button.addEventListener('click', async () => {
    if (!ready) { await prepare(); return; }
    target.print();
    onPrintRequested?.();
  });
  void prepare();
}
