import { clearChatOpened, clearDoorDraft, markChatOpened, readDoorDrafts, restoredChatEntry, recoverableChatEntry, saveDoorDraft } from "./door-drafts";

function installStorage(options: { throwOnAccess?: boolean; raw?: string } = {}) {
  const data = new Map<string, string>();
  if (options.raw !== undefined) data.set("yi-zhi.start-doors-v1", options.raw);
  const sessionStorage = options.throwOnAccess
    ? {
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("blocked"); },
        removeItem() { throw new Error("blocked"); },
      }
    : {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
      };
  (globalThis as { window?: unknown }).window = { sessionStorage, location: { pathname: "/cockpit" } };
  return data;
}

afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe("unsubmitted door drafts", () => {
  it("keeps the text and records that a file existed", () => {
    installStorage();
    saveDoorDraft("a@b.com", "resume", { text: "三段实习", hadFile: true });
    expect(readDoorDrafts("a@b.com")).toEqual({ resume: { text: "三段实习", hadFile: true } });
  });

  it("never restores another account's drafts in the same tab", () => {
    installStorage();
    saveDoorDraft("a@b.com", "jd", { text: "AI 产品经理 JD", hadFile: false });
    expect(readDoorDrafts("c@d.com")).toEqual({});
    saveDoorDraft("c@d.com", "one_sentence", { text: "换个方向", hadFile: false });
    expect(readDoorDrafts("c@d.com")).toEqual({ one_sentence: { text: "换个方向", hadFile: false } });
  });

  it("survives an unusable storage without throwing or losing the session", () => {
    installStorage({ throwOnAccess: true });
    expect(() => saveDoorDraft("a@b.com", "jd", { text: "x", hadFile: false })).not.toThrow();
    expect(readDoorDrafts("a@b.com")).toEqual({});
    expect(restoredChatEntry("a@b.com")).toBeNull();
  });

  it("drops unreadable or unknown payloads", () => {
    installStorage({ raw: "not json" });
    expect(readDoorDrafts("a@b.com")).toEqual({});
    installStorage({ raw: JSON.stringify({ account: "a@b.com", drafts: { hacked: { text: "x", hadFile: false }, jd: { text: 3, hadFile: "yes" } }, chatOpen: "hacked" }) });
    expect(readDoorDrafts("a@b.com")).toEqual({});
    expect(restoredChatEntry("a@b.com")).toBeNull();
  });

  it("keeps recoverable input until a saved reply is presented, never auto-sends it", () => {
    installStorage();
    saveDoorDraft("a@b.com", "one_sentence", { text: "不知道投什么", hadFile: false });
    markChatOpened("a@b.com", "one_sentence");
    expect(readDoorDrafts("a@b.com")).toEqual({one_sentence:{text:'不知道投什么',hadFile:false}});
    expect(restoredChatEntry("a@b.com")).toBe("one_sentence");
    clearDoorDraft('a@b.com','one_sentence');

    clearChatOpened("a@b.com");
    expect(restoredChatEntry("a@b.com")).toBeNull();
    // Leaving the conversation must not bring back a message that was already sent.
    expect(readDoorDrafts("a@b.com")).toEqual({});
  });

  it("clears only the door that was stored", () => {
    installStorage();
    saveDoorDraft("a@b.com", "resume", { text: "简历", hadFile: true });
    saveDoorDraft("a@b.com", "jd", { text: "JD", hadFile: false });
    clearDoorDraft("a@b.com", "resume");
    expect(readDoorDrafts("a@b.com")).toEqual({ jd: { text: "JD", hadFile: false } });
    clearDoorDraft("other@b.com", "jd");
    expect(readDoorDrafts("a@b.com")).toEqual({ jd: { text: "JD", hadFile: false } });
  });

  it("restores a confirmed conversation through the same entry URL without replaying input", () => {
    installStorage();
    saveDoorDraft("a@b.com", "one_sentence", {text:"先讨论",hadFile:false});
    markChatOpened("a@b.com", "one_sentence");
    expect(recoverableChatEntry("a@b.com", "one_sentence")).toBeNull();
    clearDoorDraft("a@b.com", "one_sentence");
    expect(recoverableChatEntry("a@b.com", "one_sentence")).toBe("one_sentence");
    expect(recoverableChatEntry("a@b.com")).toBe("one_sentence");
    expect(recoverableChatEntry("a@b.com", "jd")).toBeNull();
    expect(recoverableChatEntry("other@b.com", "one_sentence")).toBeNull();
    clearChatOpened("a@b.com");
    expect(recoverableChatEntry("a@b.com", "one_sentence")).toBeNull();
  });
});
