/** A project-only oral draft has no personal-name header. Keep a trailing date
 * range on its own line so the name-sized export heading cannot orphan it.
 * Applies only under the explicitly authorized raw-project format contract. */
export function formatRawProjectHeading(text: string) {
  const [first,...rest]=text.split('\n');
  const range=first.match(/^(.+)[|｜]\s*((?:19|20)\d{2}[./年]\s*\d{1,2}(?:月)?\s*[-–—至到]\s*(?:至今|现在|(?:19|20)\d{2}[./年]\s*\d{1,2}(?:月)?))\s*$/);
 return range?`### ${range[1].trim().replace(/^#{1,6}\s*/, '')}\n${range[2].trim()}\n${rest.join('\n')}`:text;
}
