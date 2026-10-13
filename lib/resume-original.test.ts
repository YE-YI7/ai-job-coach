import { originalResumeMime, originalResumeUrl, ownsOriginalResumePath } from "./resume-original";
test("original documents are owner scoped, not public URLs or traversal paths",()=>{
 const path="owner/12345678-1234-1234-1234-123456789abc.pdf";
 expect(ownsOriginalResumePath("owner",path)).toBe(true);
 for(const invalid of ["other/12345678-1234-1234-1234-123456789abc.pdf","owner/../private.pdf","owner/document.html","owner/12345678-1234-1234-1234-123456789abc.pdf/evil"])expect(ownsOriginalResumePath("owner",invalid)).toBe(false);
 expect(originalResumeUrl({path,name:"简历.pdf",mime:"application/pdf",size:32})).toContain("/api/coach/resume-original?");
 expect(originalResumeMime("evil.html")).toBeNull();
});
