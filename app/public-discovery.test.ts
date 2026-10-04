import robots from "./robots";
import sitemap from "./sitemap";

describe("public search discovery", () => {
  it("lists only actual public tasks and never private routes", () => {
    expect(sitemap().map((row) => row.url)).toEqual([
      "https://www.ai-job-coach.xin", "https://www.ai-job-coach.xin/agent",
      "https://www.ai-job-coach.xin/tools/resume-jd-gap", "https://www.ai-job-coach.xin/tools/offer-compare",
    ]);
    expect(sitemap().every((row) => !row.lastModified)).toBe(true);
  });
  it("does not invite crawlers into user data", () => {
    expect(robots().sitemap).toBe("https://www.ai-job-coach.xin/sitemap.xml");
    expect(robots().rules).toMatchObject({ userAgent: "*", disallow: expect.arrayContaining(["/api/", "/cockpit", "/login"]) });
  });
});
