import {analyticsCohort} from "./analytics-cohort";
test("only explicitly configured accounts count as internal",()=>{
 expect(analyticsCohort("owner", " owner, tester ")).toBe("internal");
 expect(analyticsCohort("other", "owner")).toBe("unclassified");
 expect(analyticsCohort("owner", undefined)).toBe("unclassified");
 expect(analyticsCohort(null, "owner")).toBe("unclassified");
});
