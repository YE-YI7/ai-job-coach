/** Native tool payloads use plain text fields. Never parse, repair or execute
 * JSON hidden inside a model-generated string. Legacy array calls remain
 * readable for replay; the new advertised contract has no nested file list. */
export const F6_WRITE_FIELDS = {
  resume_markdown: 'resume-new.md',
  notes_markdown: 'notes.md',
  mentor_markdown: 'mentor.md',
} as const;

export function f6WriteFiles(args: Record<string, unknown>, flat: boolean) {
  const supplied = Object.entries(F6_WRITE_FIELDS).filter(([field]) => Object.hasOwn(args, field));
  if (!flat || !supplied.length) return args.files;
  if (Object.hasOwn(args, 'files')) throw Error('OUTPUT_PAYLOAD_AMBIGUOUS');
  if (!Object.hasOwn(args, 'resume_markdown')) throw Error('OUTPUT_RESUME_REQUIRED');
  return supplied.map(([field, name]) => ({name, text: args[field]}));
}

export function f6HasResumeWrite(args: Record<string, unknown>) {
  return Object.hasOwn(args, 'resume_markdown') || Array.isArray(args.files)
    && args.files.some(file => file?.name === 'resume-new.md');
}

export const F6_WRITE_PROPERTIES = Object.fromEntries(Object.entries(F6_WRITE_FIELDS).map(([field, file]) => [
  field, {type: 'string', description: file === 'resume-new.md'
    ? '整份授权简历的Markdown正文，直接填文本，不编码成JSON。更新正文时提供。'
    : file === 'mentor.md' ? '给用户的直接辅导或一个关键补问，直接填文本；没有需要沟通的缺口可省略。'
      : `${file}的文本内容，按需提供；直接填文本，不编码成JSON。`},
]));
