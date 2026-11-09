import origin from './f6-origin.json';
import {F6PublicTools} from './f6-public-tools';
import type {NativeTool} from '@/lib/llm-tools';

export const F6_OUTPUT_FILES = ['portrait.md', 'battle.md', 'resume-new.md', 'changes.md', 'notes.md'];
export const F6_ORIGIN_TOOLS = origin.tools as NativeTool[];
export type F6ResourceId = 'resume.md' | 'jd.txt' | 'facts.md' | keyof typeof origin.resources;
export type F6ToolServices = {
  search: (topic: unknown) => Promise<unknown>;
  fetch: (urls: unknown) => Promise<unknown>;
  render: (text: string) => Promise<{bytes: Uint8Array; receipt: Record<string, unknown>}>;
};
export type F6Deliverables = {
  files: Record<string, string>; resumeRevision: number; renderedRevision: number;
  pdf?: {revision: number; receipt: Record<string, unknown>; base64: string; current: boolean};
};
export class F6ToolSession {
  readonly outputs = new Map<string, string>();
  private revision = 0;
  private renderedRevision = -1;
  private pdf?: {revision: number; receipt: Record<string, unknown>; base64: string};
  readonly resources: Record<string, string>;
  private services: F6ToolServices;
  constructor(input: {resume: string; jd: string; facts: unknown; company?: string; domain?: string},
    private verify: (body: string) => string[], services?: F6ToolServices,
    publicCheckpoint?: Array<{name: string; output: Record<string, unknown>}>) {
    this.resources = {...origin.resources, 'resume.md': input.resume, 'jd.txt': input.jd,
      'facts.md': typeof input.facts === 'string' ? input.facts : JSON.stringify(input.facts)};
    const company = input.company || '';
    // Preserve the experiment's explicitly identified public research target.
    // Unknown companies are not silently treated as Manus or called official.
    const domain = input.domain || (company.toLowerCase() === origin.researchTarget.company.toLowerCase()
      ? origin.researchTarget.domain : '');
    const research = new F6PublicTools(company, domain);
    if (publicCheckpoint) research.restoreCompletedCalls(publicCheckpoint);
    this.services = services || {
      search: topic => research.search(topic), fetch: urls => research.read(urls),
      render: async text => (await import('./f6-render-pdf')).renderF6Pdf(text),
    };
  }
  async invoke(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === 'read_file') {
      if (typeof args.file !== 'string' || !Object.hasOwn(this.resources, args.file)) throw Error('READ_OUTSIDE_SCOPE');
      return {file: args.file, text: this.resources[args.file]};
    }
    if (name === 'search') return await this.services.search(args.topic) as Record<string, unknown>;
    if (name === 'fetch') return await this.services.fetch(args.urls) as Record<string, unknown>;
    if (name === 'write_output') {
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > 5) throw Error('OUTPUT_FILE_LIST_INVALID');
      const files = args.files as Array<{name: string; text: string}>;
      const names = new Set();
      for (const file of files) {
        if (!file || !F6_OUTPUT_FILES.includes(file.name) || names.has(file.name)
          || typeof file.text !== 'string' || !file.text.trim() || Buffer.byteLength(file.text) >= 20_000) {
          throw Error('OUTPUT_SCOPE_OR_SIZE_INVALID');
        }
        names.add(file.name);
      }
      const candidate = files.find(file => file.name === 'resume-new.md');
      const issues = candidate ? this.verify(candidate.text) : [];
      if (issues.length) return {saved: [], applied: false, issues,
        instruction: '程序未接收这版。对照原稿核实并修正，交回完整新稿；诊断不提供新的经历事实。'};
      for (const file of files) {
        const text = file.text;
        if (file.name === 'resume-new.md' && this.outputs.get(file.name) !== text) this.revision++;
        this.outputs.set(file.name, text);
      }
      return {saved: files.map(file => file.name), resumeRevision: this.revision, applied: false};
    }
    if (name === 'render_pdf') {
      const text = this.outputs.get('resume-new.md');
      if (!text) throw Error('NO_SAVED_RESUME_TO_RENDER');
      const result = await this.services.render(text);
      this.pdf = {revision: this.revision, receipt: result.receipt, base64: Buffer.from(result.bytes).toString('base64')};
      this.renderedRevision = this.revision;
      return {...result.receipt, renderedRevision: this.renderedRevision};
    }
    throw Error('F6_UNKNOWN_TOOL');
  }
  captureVisibleBody(text: string) {
    if (this.outputs.get('resume-new.md') !== text) this.revision++;
    this.outputs.set('resume-new.md', text);
  }
  deliverables(): F6Deliverables {
    return {files: Object.fromEntries(this.outputs), resumeRevision: this.revision,
      renderedRevision: this.renderedRevision,
      ...(this.pdf ? {pdf: {...this.pdf, current: this.pdf.revision === this.revision}} : {})};
  }
}
