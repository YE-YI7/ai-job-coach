import {createHash} from 'node:crypto';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';

const escape = (s: string) => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]!));
const inline = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export function f6PrintHtml(markdown: string, fontData: string) {
  const rows: string[] = []; let list = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('- ')) {
      if (!list) { rows.push('<ul>'); list = true; }
      rows.push(`<li>${inline(line.slice(2))}</li>`); continue;
    }
    if (list) { rows.push('</ul>'); list = false; }
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,6}) (.*)/);
    rows.push(h ? `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>` : `<p>${inline(line)}</p>`);
  }
  if (list) rows.push('</ul>');
  return `<html><head><meta charset="utf-8"><style>
@font-face{font-family:F6Print;src:url(data:font/woff2;base64,${fontData}) format('woff2')}
@page{size:A4;margin:10mm}
body{margin:0;font-family:F6Print,sans-serif;font-size:8.5pt;line-height:1.45;color:#111}
h1{font-size:14.5pt;margin:0 0 4px}h2{font-size:10pt;border-bottom:1px solid #333;margin:8px 0 3px}
h3{font-size:9pt;margin:5px 0 1px}p{margin:1px 0}ul{margin:1px 0 2px;padding-left:14px}li{margin:1px 0}
</style></head><body>${rows.join('\n')}</body></html>`;
}

/** Real Chromium rendering, never an estimated page counter. All resources are
 * local/data URLs; candidate text cannot trigger network or execute JavaScript. */
export async function renderF6Pdf(markdown: string) {
  const [{default: puppeteer}, {default: chromium}] = await Promise.all([
    import('puppeteer-core'), import('@sparticuz/chromium'),
  ]);
  let executablePath: string;
  if (process.platform === 'darwin') {
    executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    await access(executablePath);
  } else executablePath = await chromium.executablePath();
  const font = await readFile(path.join(process.cwd(), 'public/fonts/resume-serif-400.woff2'));
  const browser = await puppeteer.launch({executablePath, headless: 'shell',
    args: process.platform === 'darwin' ? [] : chromium.args});
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().startsWith('data:') || request.url() === 'about:blank') void request.continue();
      else void request.abort();
    });
    await page.setViewport({width: Math.round(190 / 25.4 * 96), height: 800});
    await page.setContent(f6PrintHtml(markdown, font.toString('base64')), {timeout: 20_000});
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.body.scrollHeight);
    const bytes = await page.pdf({format: 'A4', printBackground: true, timeout: 20_000});
    // PDF.js loads canvas via a dynamic createRequire that serverless tracing
    // cannot discover. Import it explicitly before loading the parser.
    const canvas = await import('@napi-rs/canvas');
    for (const name of ['DOMMatrix', 'ImageData', 'Path2D'] as const) {
      if (!(name in globalThis)) Object.assign(globalThis, {[name]: canvas[name]});
    }
    const [{PDFParse}, {getData}] = await Promise.all([import('pdf-parse'), import('pdf-parse/worker')]);
    PDFParse.setWorker(getData());
    // PDF.js transfers its input buffer to the worker. Give it an independent
    // copy or the downloadable bytes become detached after page inspection.
    const parser = new PDFParse({data: new Uint8Array(bytes)});
    try {
      const info = await parser.getInfo(), text = await parser.getText();
      if (info.total < 1 || !text.text.trim()) throw Error('PDF_PAGE_SIZE_OR_TEXT_LAYER_UNVERIFIED');
      if (bytes.length < 1000 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw Error('PDF_BYTES_MISSING');
      const estimated = Math.ceil(height / (277 / 25.4 * 96));
      return {bytes, receipt: {pdfId: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        pages: info.total, estimatedPages: estimated, actualPageSize: 'A4', textLayer: true,
        lastPageFill: +(height / (277 / 25.4 * 96) - (estimated - 1)).toFixed(2),
        chars: markdown.replace(/[\s#*\-\[\]]/g, '').length, font: 8.5, margin: 10,
        fontFamily: 'YiZhi Resume Serif (portable self-hosted font)',
      }};
    } finally { await parser.destroy(); }
  } finally { await browser.close(); }
}
