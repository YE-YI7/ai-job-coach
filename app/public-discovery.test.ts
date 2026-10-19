import robots from "./robots";
import sitemap from "./sitemap";

describe("public search discovery", () => {
  it("lists only actual public tasks and never private routes", () => {
    expect(sitemap().map((row) => row.url)).toEqual([
      "https://yizhioffer.com", "https://yizhioffer.com/agent",
      "https://yizhioffer.com/tools/resume-jd-gap", "https://yizhioffer.com/tools/offer-compare",
    ]);
    expect(sitemap().every((row) => !row.lastModified)).toBe(true);
  });
  it("does not invite crawlers into user data", () => {
    expect(robots().sitemap).toBe("https://yizhioffer.com/sitemap.xml");
    expect(robots().rules).toMatchObject({ userAgent: "*", disallow: expect.arrayContaining(["/api/", "/cockpit", "/login"]) });
  });
});
