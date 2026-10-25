import { bindResumePrintAction, readyResumePrintFonts } from './resume-print-fonts';
import { resumePrintHtml } from './resume-print';

test('serif print uses the licensed local face without changing CJK text', () => {
  const text = '入口、窗口、口；又、又一次；猹、→；口径与责任边界。';
  const html = resumePrintHtml(text, 'classic', '字体验收');
  expect(html).toContain(text);
  expect(html).toContain('font-family:"YiZhi Resume Serif"');
  expect(html).toContain('/fonts/source-han-serif-home.woff2');
  expect(html).not.toContain('Songti SC');
  expect(html).not.toContain('⼜');
  expect(resumePrintHtml(text, 'modern', '无衬线')).not.toContain('@font-face');
});
test('print waits for loaded fonts and permits recovery without changing the resume', async () => {
  let listener: () => Promise<void> = async () => undefined;
  let resolveFont!: (value: object[]) => void;
  const button = { disabled: false, textContent: '', addEventListener: (_: string, action: typeof listener) => { listener = action; } };
  const status = { textContent: '' };
  const fonts = { load: jest.fn(() => new Promise<object[]>(resolve => { resolveFont = resolve; })), ready: Promise.resolve() };
  const target = { document: { fonts, getElementById: (id: string) => id === 'print' ? button : status }, print: jest.fn() } as unknown as Window;
  bindResumePrintAction(target, true);
  expect(button.disabled).toBe(true);
  expect(target.print).not.toHaveBeenCalled();
  resolveFont([{}]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(button.disabled).toBe(false);
  await listener();
  expect(target.print).toHaveBeenCalledTimes(1);
  expect(status.textContent).toContain('字体已就绪');
});
test('failed fonts never silently print with the broken OS fallback', async () => {
  const document = { fonts: { load: async () => [], ready: Promise.resolve() } } as unknown as Document;
  await expect(readyResumePrintFonts(document, true)).rejects.toThrow('resume_font_unavailable');
  await expect(readyResumePrintFonts({} as Document, true)).rejects.toThrow('font_loading_unavailable');
});
