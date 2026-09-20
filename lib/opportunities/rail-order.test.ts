import {railSeq, reorderIds, sortOpportunitiesForRail, togglePin} from "./rail-order";

const item=(id:string)=>({id});
const ids=(arr:Array<{id:string}>)=>arr.map(x=>x.id);

describe("railSeq",()=>{
  test("known order first, unseen appended in item order",()=>{
    expect(railSeq(["a","b","c"],["c","a"])).toEqual(["c","a","b"]);
  });
  test("drops stale ids and keeps all live ids",()=>{
    expect(railSeq(["a","b"],["b","ghost","a"])).toEqual(["b","a"]);
  });
});

describe("sortOpportunitiesForRail",()=>{
  test("pinned float to front, relative order preserved within groups",()=>{
    const items=[item("a"),item("b"),item("c"),item("d")];
    expect(ids(sortOpportunitiesForRail(items,["a","b","c","d"],["c"]))).toEqual(["c","a","b","d"]);
  });
  test("empty order/pins falls back to item order",()=>{
    const items=[item("x"),item("y")];
    expect(ids(sortOpportunitiesForRail(items,[],[]))).toEqual(["x","y"]);
  });
});

describe("reorderIds",()=>{
  test("moves an item to the target index",()=>{
    expect(reorderIds(["a","b","c","d"],"a","c")).toEqual(["b","c","a","d"]);
    expect(reorderIds(["a","b","c"],"c","a")).toEqual(["c","a","b"]);
  });
  test("no-op on missing or same id",()=>{
    const base=["a","b"];
    expect(reorderIds(base,"a","a")).toBe(base);
    expect(reorderIds(base,"a","zz")).toBe(base);
  });
});

test("togglePin adds and removes",()=>{
  expect(togglePin([],"a")).toEqual(["a"]);
  expect(togglePin(["a","b"],"a")).toEqual(["b"]);
});
