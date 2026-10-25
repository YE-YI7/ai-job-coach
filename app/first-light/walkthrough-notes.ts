interface NotesHost {
  childNodes: ArrayLike<ChildNode>;
  scrollTop: number;
  replaceChildren(...nodes: Node[]): void;
}

/** 保留真实节点和选择监听，只展示当前演示场景的批注。 */
export function createWalkthroughNotes(host: NotesHost) {
  const chapters = new Map<string, { nodes: ChildNode[]; scrollTop: number }>();
  let current = "job";
  return (chapter: string) => {
    if (chapter === current) return;
    chapters.set(current, {
      nodes: Array.from(host.childNodes),
      scrollTop: host.scrollTop,
    });
    const saved = chapters.get(chapter);
    host.replaceChildren(...(saved?.nodes ?? []));
    host.scrollTop = saved?.scrollTop ?? 0;
    current = chapter;
  };
}
