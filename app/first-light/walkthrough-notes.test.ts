import { createWalkthroughNotes } from "./walkthrough-notes";

function fixture() {
  const host = {
    childNodes: [] as ChildNode[],
    scrollTop: 0,
    replaceChildren(...nodes: Node[]) {
      this.childNodes = nodes as ChildNode[];
    },
  };
  const node = (name: string) => ({ name, choose: jest.fn() }) as unknown as ChildNode;
  return { host, node, switchChapter: createWalkthroughNotes(host) };
}

describe("homepage walkthrough chapter notes", () => {
  it("does not carry job or resume notes into the interview", () => {
    const { host, node, switchChapter } = fixture();
    const job = node("job"), resume = node("resume"), interview = node("interview");
    host.childNodes = [job];
    switchChapter("resume");
    expect(host.childNodes).toEqual([]);
    host.childNodes = [resume];
    switchChapter("interview");
    expect(host.childNodes).toEqual([]);
    host.childNodes = [interview];
    switchChapter("resume");
    expect(host.childNodes).toEqual([resume]);
    switchChapter("job");
    expect(host.childNodes).toEqual([job]);
  });

  it("preserves the same unresolved choice node and its handler on return", () => {
    const { host, node, switchChapter } = fixture();
    switchChapter("resume");
    const choice = node("unresolved resume choice");
    host.childNodes = [choice];
    switchChapter("interview");
    switchChapter("resume");
    expect(host.childNodes[0]).toBe(choice);
    const restored = host.childNodes[0] as unknown as { choose: jest.Mock };
    restored.choose();
    expect(restored.choose).toHaveBeenCalledTimes(1);
  });

  it("restores scroll separately without wiping new notes in the same chapter", () => {
    const { host, node, switchChapter } = fixture();
    host.childNodes = [node("job")];
    host.scrollTop = 110;
    switchChapter("resume");
    expect(host.scrollTop).toBe(0);
    host.childNodes = [node("resume")];
    host.scrollTop = 240;
    switchChapter("job");
    expect(host.scrollTop).toBe(110);
    switchChapter("resume");
    expect(host.scrollTop).toBe(240);
    const newNote = node("new reply");
    host.childNodes.push(newNote);
    switchChapter("resume");
    expect(host.childNodes.at(-1)).toBe(newNote);
  });
});
