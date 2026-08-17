export type KnowledgePlatform = "github" | "reddit" | "linkedin" | "nowcoder" | "xiaohongshu" | "other";

export type AgentKnowledgeTask =
  | "career_coaching"
  | "job_analysis"
  | "resume_tailoring"
  | "mock_interview"
  | "answer_assessment"
  | "interview_review";

export interface AgentKnowledgeItem {
  id: string;
  platform: KnowledgePlatform;
  sourceKind: "interview_experience" | "job_search_story" | "question_bank" | "guide" | "discussion";
  title: string;
  url: string;
  company: string | null;
  roles: string[];
  stages: string[];
  summary: string;
  keyPoints: string[];
  interviewQuestions: string[];
  publishedAt: string | null;
  qualityScore: number;
}

export interface AgentKnowledgeContext {
  task: AgentKnowledgeTask;
  items: AgentKnowledgeDocument[];
  contextText: string;
}

export interface AgentKnowledgeEvidence {
  platform: KnowledgePlatform;
  sourceKind: AgentKnowledgeItem["sourceKind"];
  url: string;
  title: string;
  company: string | null;
  publishedAt: string | null;
  summary: string;
}

export interface AgentKnowledgeDocument {
  id: string;
  title: string;
  description: string;
  goal: string;
  scope: string;
  roles: string[];
  companies: string[];
  stages: string[];
  tasks: AgentKnowledgeTask[];
  useWhen: string[];
  doNotUseWhen: string[];
  confidence: "low" | "medium" | "high";
  status: "active" | "draft" | "archived";
  reviewedAt: string;
  content: string;
  evidence: AgentKnowledgeEvidence[];
}
