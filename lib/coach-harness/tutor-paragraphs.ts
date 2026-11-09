import type { Root, Paragraph, PhrasingContent, Parent } from 'mdast';

/** Presentation only: split prose at sentence boundaries after Markdown has
 * parsed. Lists elsewhere cannot disable it; emphasis, links and code survive. */
export function remarkTutorParagraphs() {
  const size = (node: PhrasingContent): number => 'value' in node ? node.value.length
    : 'children' in node ? node.children.reduce((sum, child) => sum + size(child), 0) : 0;
  const split = (node: Paragraph): Paragraph[] => {
    if (node.children.reduce((sum, child) => sum + size(child), 0) < 160) return [node];
    const groups: PhrasingContent[][] = [[]];
    let length = 0;
    for (const child of node.children) {
      // Don't break links/inline code/emphasis. A line break inside those can
      // change meaning or introduce visible Markdown delimiters.
      const pieces: PhrasingContent[] = child.type === 'text'
        ? child.value.split(/(?<=[。！？])/u).filter(Boolean).map(value => ({ type: 'text', value })) : [child];
      for (const piece of pieces) {
        groups.at(-1)!.push(piece);
        length += size(piece);
        if (length >= 90 && piece.type === 'text' && /[。！？]$/u.test(piece.value)) {
          groups.push([]); length = 0;
        }
      }
    }
    return groups.filter(children => children.length).map(children => ({ type: 'paragraph', children }));
  };
  const visit = (parent: Parent) => {
    parent.children = parent.children.flatMap<Parent['children'][number]>(node => {
      if (node.type === 'paragraph') return split(node);
      if ('children' in node) visit(node as Parent);
      return [node];
    });
  };
  return (tree: Root) => { visit(tree); };
}
