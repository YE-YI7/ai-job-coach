/**
 * 简历解析函数（MVP 版本 - 非 AI 解析）
 * 
 * 这是一个占位实现，使用简单的文本解析规则提取简历信息
 * 未来可以升级为使用 AI 进行更智能的解析
 */

export interface ResumeData {
  name: string;
  education: Array<{
    school?: string;
    major?: string;
    degree?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  experience: Array<{
    company?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  skills: string[];
  projects: Array<{
    name?: string;
    description?: string;
    technologies?: string[];
    startDate?: string;
    endDate?: string;
  }>;
}

/**
 * 解析简历文本为结构化数据
 * 
 * @param text - 简历文本内容
 * @returns 结构化的简历数据
 */
export async function parseResume(text: string): Promise<ResumeData> {
  if (!text || typeof text !== "string") {
    return {
      name: "",
      education: [],
      experience: [],
      skills: [],
      projects: [],
    };
  }

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  // 初始化结果对象
  const result: ResumeData = {
    name: "",
    education: [],
    experience: [],
    skills: [],
    projects: [],
  };

  // 简单的文本解析逻辑
  let currentSection = "";
  let currentItem: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // 检测姓名（通常在开头）
    if (i < 3 && !result.name && line.length < 20 && !lowerLine.includes("@")) {
      // 可能是姓名行（不包含邮箱，长度较短）
      if (/^[\u4e00-\u9fa5a-zA-Z\s]+$/.test(line)) {
        result.name = line;
        continue;
      }
    }

    // 检测教育经历
    if (lowerLine.includes("教育") || lowerLine.includes("education") || 
        lowerLine.includes("学历") || lowerLine.includes("毕业")) {
      currentSection = "education";
      continue;
    }

    // 检测工作经历
    if (lowerLine.includes("工作") || lowerLine.includes("experience") || 
        lowerLine.includes("实习") || lowerLine.includes("employment")) {
      currentSection = "experience";
      continue;
    }

    // 检测技能
    if (lowerLine.includes("技能") || lowerLine.includes("skill") || 
        lowerLine.includes("能力") || lowerLine.includes("技术栈")) {
      currentSection = "skills";
      continue;
    }

    // 检测项目
    if (lowerLine.includes("项目") || lowerLine.includes("project") || 
        lowerLine.includes("作品")) {
      currentSection = "projects";
      continue;
    }

    // 根据当前章节解析内容
    if (currentSection === "education") {
      // 尝试匹配学校名称（包含"大学"、"学院"等关键词）
      if (/(大学|学院|学校|University|College|School)/i.test(line)) {
        if (currentItem) {
          result.education.push(currentItem);
        }
        currentItem = { school: line };
      } else if (currentItem) {
        // 继续添加到当前教育项
        if (!currentItem.major && /专业|Major/.test(line)) {
          currentItem.major = line.replace(/专业[:：]?/i, "").trim();
        } else if (!currentItem.degree && /(本科|硕士|博士|Bachelor|Master|PhD)/i.test(line)) {
          currentItem.degree = line;
        } else if (!currentItem.description) {
          currentItem.description = line;
        }
      }
    } else if (currentSection === "experience") {
      // 尝试匹配公司名称或职位
      if (/公司|Company|有限公司/.test(line) || 
          /(产品经理|工程师|开发|Developer|Engineer|Manager)/i.test(line)) {
        if (currentItem) {
          result.experience.push(currentItem);
        }
        // 尝试分离职位和公司
        const parts = line.split(/[|｜\s]+/);
        currentItem = {
          position: parts[0] || line,
          company: parts[1] || "",
        };
      } else if (currentItem) {
        // 日期匹配
        if (/\d{4}[-年]\d{1,2}[-月]?/.test(line)) {
          const dates = line.match(/(\d{4}[-年]\d{1,2}[-月]?)/g);
          if (dates && dates.length >= 1) {
            currentItem.startDate = dates[0].replace(/[年月]/g, "-");
            if (dates.length >= 2) {
              currentItem.endDate = dates[1].replace(/[年月]/g, "-");
            }
          }
        } else if (!currentItem.description) {
          currentItem.description = line;
        } else {
          currentItem.description += "\n" + line;
        }
      }
    } else if (currentSection === "skills") {
      // 技能通常是逗号或换行分隔的关键词
      const skills = line.split(/[,，、;；\s]+/).map(s => s.trim()).filter(s => s.length > 0);
      result.skills.push(...skills);
    } else if (currentSection === "projects") {
      // 项目名称通常较短且可能包含技术关键词
      if (line.length < 50 && 
          (!currentItem || /项目|Project|名称/.test(lowerLine))) {
        if (currentItem) {
          result.projects.push(currentItem);
        }
        currentItem = {
          name: line.replace(/项目[:：]?/i, "").trim() || line,
        };
      } else if (currentItem) {
        // 项目描述
        if (!currentItem.description) {
          currentItem.description = line;
        } else {
          currentItem.description += "\n" + line;
        }
        
        // 检测技术栈关键词
        const techKeywords = ["React", "Vue", "Node.js", "Python", "Java", "TypeScript", 
                             "JavaScript", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes"];
        for (const keyword of techKeywords) {
          if (line.includes(keyword) && !currentItem.technologies) {
            currentItem.technologies = [];
          }
          if (line.includes(keyword) && currentItem.technologies) {
            if (!currentItem.technologies.includes(keyword)) {
              currentItem.technologies.push(keyword);
            }
          }
        }
      }
    }
  }

  // 添加最后一个项目
  if (currentSection === "education" && currentItem) {
    result.education.push(currentItem);
  }
  if (currentSection === "experience" && currentItem) {
    result.experience.push(currentItem);
  }
  if (currentSection === "projects" && currentItem) {
    result.projects.push(currentItem);
  }

  // 去重技能
  result.skills = Array.from(new Set(result.skills));

  // 如果姓名仍未找到，尝试从文本开头提取
  if (!result.name && lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine.length < 30 && /^[\u4e00-\u9fa5a-zA-Z\s]+$/.test(firstLine)) {
      result.name = firstLine;
    }
  }

  return result;
}

















