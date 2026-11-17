const IDENTITY_CHANGED = '姓名与联系方式保留原文，不由自动改稿更改；需要时可手动编辑';

function plainText(text: string) {
  return text.normalize('NFKC')
    .replace(/(^|[\s#|｜:：])(\*\*|__)([^\n]+?)\2(?=$|[\s:：|｜])/gm, '$1$3');
}

function contactValues(text: string) {
  const plain = plainText(text);
  const emails = plain.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
  const phones = [...plain.matchAll(/(?<!\d)(?:\+?86[\s-]*)?(1[3-9](?:[\s()-]*\d){9})(?!\d)/g)]
    .map(match => match[1].replace(/\D/g, ''));
  return new Set([
    ...emails.map(value => `email:${value.toLowerCase()}`),
    ...phones.map(value => `phone:${value}`),
  ]);
}

/** Only an explicit name field is a reliable programmatic anchor. A short
 * first line can equally be a heading or an instruction, not a person's name. */
function namedValues(text: string) {
  const fields = plainText(text).matchAll(/(?:^|[\s|｜,，;；])(?:姓名|name)\s*[:：]\s*([^\n|｜,，;；\t]+)/gim);
  return new Set([...fields].map(match => match[1]
    .replace(/\s+[^\s:：]+\s*[:：].*$/, '')
    .replace(/\s+/g, ' ').trim()).filter(Boolean));
}

function sameValues(before: Set<string>, after: Set<string>) {
  return before.size === after.size && [...before].every(value => after.has(value));
}

function containsName(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])`, 'iu')
    .test(plainText(text).replace(/\s+/g, ' '));
}

/** F6's hard identity check compares values, not layout or occurrence counts.
 * Portfolio/project URLs remain selectable content, not identity vetoes.
 * Unlabelled names are deliberately not guessed; this is not a semantic audit. */
export function resumeDocumentIdentityIssues(source: string, candidate: string): string[] {
  if (!sameValues(contactValues(source), contactValues(candidate))) return [IDENTITY_CHANGED];

  const sourceNames = namedValues(source);
  if (!sourceNames.size) return [];
  const candidateNames = namedValues(candidate);
  const preserved = candidateNames.size
    ? sameValues(sourceNames, candidateNames)
    : [...sourceNames].every(name => containsName(candidate, name));
  return preserved ? [] : [IDENTITY_CHANGED];
}
