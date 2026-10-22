import { ENTRY_DOORS, ENTRY_KINDS, conversationTitle, entryHref, intakeEntryFor, isMaterialEntry, parseEntryKind } from "./entry-doors";

describe("four starting doors", () => {
  it("is exactly the four agreed kinds, in order", () => {
    expect(ENTRY_DOORS.map((door) => door.kind)).toEqual([...ENTRY_KINDS]);
  });

  it("gives every door the fields its surface renders", () => {
    for (const door of ENTRY_DOORS) {
      for (const field of ["index", "meta", "title", "desc", "out", "cta", "placeholder"] as const) {
        expect(door[field].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps example chips short enough to stay editable sentences", () => {
    for (const door of ENTRY_DOORS) {
      expect(door.chips.length).toBeLessThanOrEqual(4);
      for (const chip of door.chips) expect(chip.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("entryHref / parseEntryKind", () => {
  it("carries only the enum in the URL", () => {
    for (const kind of ENTRY_KINDS) expect(entryHref(kind)).toBe(`/cockpit?entry=${kind}`);
  });

  it("accepts nothing that is not one of the four", () => {
    const rejected = [undefined, null, "", "RESUME", "resume ", "resume\n", "one_sentence;", "__proto__", "constructor", "toString", 1, {}, [], "javascript:alert(1)"];
    for (const value of rejected) expect(parseEntryKind(value)).toBeNull();
  });

  it("accepts every declared kind", () => {
    for (const kind of ENTRY_KINDS) expect(parseEntryKind(kind)).toBe(kind);
  });
});

describe("routing a door to real behaviour", () => {
  it("sends only the material doors through the existing intake", () => {
    expect(intakeEntryFor("resume")).toBe("direction");
    expect(intakeEntryFor("jd")).toBe("resume");
    expect(intakeEntryFor("find_jobs")).toBeNull();
    expect(intakeEntryFor("one_sentence")).toBeNull();
    expect(ENTRY_DOORS.filter((door) => isMaterialEntry(door.kind)).map((door) => door.kind)).toEqual(["resume", "jd"]);
  });

  it("names a conversation by its door and never by more than one line of it", () => {
    expect(conversationTitle("one_sentence", "  投了几十份\n没有面试  ")).toBe("先说一句 · 投了几十份 没有面试");
    expect(conversationTitle("find_jobs", "")).toBe("找岗位 · 待定方向");
    expect(conversationTitle("one_sentence", "长".repeat(120))).toHaveLength("先说一句 · ".length + 48);
  });
});
