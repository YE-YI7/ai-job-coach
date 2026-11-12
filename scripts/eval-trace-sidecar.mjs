// Loopback-only, read-only mirror for explicitly provided private Eval archives.
// No credentials, database, model clients or product writes are used here.
import {createServer} from 'node:http';
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, dirname, basename, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sanitize} from '../public/eval-lab/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public/eval-lab');
const assets = new Set(['brief.html','brief.css','brief.mjs','brief-model.mjs','core.mjs','outfit.woff2',
  'index.html','app.mjs','trace-view.mjs','trace-flow.mjs','trace-flow.css','trace.css','styles.css','samples.mjs']);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.woff2':'font/woff2'};
export async function archiveRuns(archives) {
  const runs = [];
  for (const archive of archives) {
    if ((await stat(archive)).isFile()) {
      runs.push(JSON.parse(await readFile(archive,'utf8')));
      continue;
    }
    const entries = await readdir(archive);
    const state = JSON.parse(await readFile(resolve(archive,'state.json'),'utf8'));
    for (const file of entries.filter(name => /^trace-\d+\.json$/.test(name))) {
      const index = Number(file.match(/\d+/)[0]);
      const slot = state.slots.find(item => item.index === index);
      if (!slot) continue;
      const run = JSON.parse(await readFile(resolve(archive,file),'utf8'));
      runs.push({...run,id:slot.id,
        presentationNote:'2026-11-12 职责纠偏：HR 应模拟招聘筛选。此前将辅导审计混入职责的实验仍保留，不能当成招聘判断已通过。'});
    }
  }
  return runs.sort((a,b) => Date.parse(b.startedAt || b.createdAt) - Date.parse(a.startedAt || a.createdAt));
}
export function sidecar(archives) {
  return createServer(async (request,response) => {
    const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};
    const send = (status,body,type='application/json') => {
      response.writeHead(status,{...headers,'Content-Type':type});
      response.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || ''))
      return send(403,{error:'Loopback host only'});
    if (request.method !== 'GET') return send(405,{error:'Read only'});
    const url = new URL(request.url,'http://localhost');
    try {
      if (url.pathname === '/') {
        response.writeHead(302,{...headers,Location:'/eval-lab/brief.html'+url.search});
        return response.end();
      }
      if (url.pathname === '/admin/evals') {
        response.writeHead(302,{...headers,Location:'/eval-lab/index.html?live=1'});
        return response.end();
      }
      if (url.pathname === '/api/admin/eval-runs') {
        const runs = await archiveRuns(archives), id = url.searchParams.get('id');
        if (id) {
          const found = runs.find(run => run.id === id);
          return found ? send(200,{runs:[sanitize(found)]}) : send(404,{error:'这条运行不在本机证据目录中'});
        }
        return send(200,{localArchive:true,captured:runs.map(run => ({id:run.id,
          label:run.label,created_at:run.startedAt || run.createdAt,status:run.status}))});
      }
      if (url.pathname === '/api/admin/eval-feedback') return send(200,{cases:[]});
      const name = url.pathname === '/' ? 'brief.html' : basename(url.pathname);
      if (!assets.has(name) || (url.pathname !== '/' && url.pathname !== `/eval-lab/${name}`))
        return send(404,{error:'本机只开放竖屏 Trace；完整记录在正式管理员入口中查看。'});
      send(200,await readFile(resolve(root,name)),mime[extname(name)]);
    } catch {
      send(503,{error:'证据暂时无法读取，请重试；未用演示数据替代。'});
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const archives = process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(path => resolve(path));
  if (!archives.length) throw Error('Pass explicit private archive directories.');
  const port = Number(process.env.EVAL_SIDECAR_PORT || 3451);
  sidecar(archives).listen(port,'127.0.0.1',() => console.log(`Read-only Trace: http://127.0.0.1:${port}/`));
}
