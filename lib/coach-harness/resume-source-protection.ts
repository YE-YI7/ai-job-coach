/** Automated editing must not rewrite identity/contact or upgrade an example to a real project. */
export function resumeSourceProtection(before: string, after: string, section: string, resume = ""): string[] {
  const identitySection = /^(?:姓名(?:栏)?|基本信息|个人信息|个人资料|联系方式|联系信息|简历抬头)(?:$|[\s：:、/（(])/;
  const contact = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)1[3-9]\d{9}(?!\d)|(?:电话|手机|邮箱)\s*[:：]/i;
  const firstLine = resume.split(/\n/).map(line => line.replace(/^#+\s*/, "").trim()).find(Boolean) || "";
  const nameLine = /^(?:姓名\s*[:：]|name\s*:)/i.test(firstLine)
    || /^[\p{Script=Han}·]{2,5}(?:[（(][^）)]{0,40}[）)])?$/u.test(firstLine);
  if (identitySection.test(section.trim()) || contact.test(before)
    || (nameLine && before.replace(/^#+\s*/, "").trim() === firstLine)) return ["姓名与联系方式保留原文，不由自动改稿更改；需要时可手动编辑"];
  const educationStatus = ["在读", "预计", "肄业", "结业", "未毕业", "未获得学位", "未取得学位"];
  const markers = ["虚构", "示例", "练习", "模拟", "教学", "个人项目", "课程项目", ...educationStatus];
  const at = resume.indexOf(before);
  // A qualifier already in this exact, unchanged Markdown heading need not
  // be repeated in every bullet. Never borrow a label from another project.
  const localHeading = before && at >= 0 && resume.indexOf(before, at + before.length) < 0 && !/^\s*#/m.test(before)
    ? resume.slice(0, at).split('\n').filter(line=>/^\s*#{1,6}\s+\S/.test(line)).at(-1) || '' : '';
  return markers.filter(marker => before.includes(marker) && !after.includes(marker) && !localHeading.includes(marker))
    .map(marker => educationStatus.includes(marker)
      ? "不能去掉原文的在读、预计或未毕业等学历状态；时间范围不能替代明确状态，也不能把未取得的学历写成已获得"
      : "不能去掉原文的虚构、示例或练习性质标记");
}
