import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";
import { extractPdfText } from "@/lib/pdf-text";
// LangChain 已移除，以下导入已注释
// import { Document } from "@langchain/core/documents";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// 临时 Document 类定义（用于兼容）
class Document {
  pageContent: string;
  metadata: Record<string, any>;
  
  constructor(data: { pageContent: string; metadata?: Record<string, any> }) {
    this.pageContent = data.pageContent;
    this.metadata = data.metadata || {};
  }
}

// 临时文本切分器实现（简化版）
class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  
  constructor(options: { chunkSize: number; chunkOverlap: number }) {
    this.chunkSize = options.chunkSize;
    this.chunkOverlap = options.chunkOverlap;
  }
  
  async splitDocuments(documents: Document[]): Promise<Document[]> {
    const results: Document[] = [];
    for (const doc of documents) {
      const chunks = this.splitText(doc.pageContent);
      for (const chunk of chunks) {
        results.push(new Document({
          pageContent: chunk,
          metadata: { ...doc.metadata },
        }));
      }
    }
    return results;
  }
  
  private splitText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - this.chunkOverlap;
      if (start >= text.length) break;
    }
    return chunks;
  }
}

/**
 * 递归读取目录下的所有文件
 * @param dirPath 目录路径
 * @param fileList 文件列表（用于递归）
 * @returns 文件路径数组
 */
function getAllFiles(dirPath: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 递归读取子目录
      getAllFiles(filePath, fileList);
    } else {
      // 只添加支持的文件类型
      const ext = path.extname(file).toLowerCase();
      if (['.md', '.txt', '.pdf', '.docx'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * 读取 Markdown 或文本文件
 * @param filePath 文件路径
 * @returns 文件内容
 */
async function readTextFile(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

/**
 * 读取 PDF 文件
 * @param filePath 文件路径
 * @returns 文件内容
 */
async function readPdfFile(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  return extractPdfText(buffer);
}

/**
 * 读取 DOCX 文件
 * @param filePath 文件路径
 * @returns 文件内容
 */
async function readDocxFile(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * 根据文件扩展名读取文件内容
 * @param filePath 文件路径
 * @returns 文件内容
 */
async function readFileContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.md':
    case '.txt':
      return await readTextFile(filePath);
    case '.pdf':
      return await readPdfFile(filePath);
    case '.docx':
      return await readDocxFile(filePath);
    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }
}

/**
 * 加载知识库中的所有文档
 * 读取 /src/lib/knowledge/ 目录下的所有支持格式的文件
 * 支持格式：.md, .txt, .pdf, .docx
 * 使用递归切分器将文档切分为 chunkSize: 500, chunkOverlap: 50 的块
 * 
 * @returns Promise<Document[]> LangChain Document 数组
 */
export async function loadKnowledgeBase(): Promise<Document[]> {
  // 获取知识库目录路径
  const knowledgeDir = path.join(process.cwd(), 'src', 'lib', 'knowledge');
  
  // 检查目录是否存在
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`知识库目录不存在: ${knowledgeDir}`);
  }

  // 获取所有支持的文件
  const files = getAllFiles(knowledgeDir);
  
  if (files.length === 0) {
    console.warn(`在 ${knowledgeDir} 目录下未找到支持的文件（.md, .txt, .pdf, .docx）`);
    return [];
  }

  // 创建递归文本切分器
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const allDocuments: Document[] = [];

  // 处理每个文件
  for (const filePath of files) {
    try {
      // 读取文件内容
      const content = await readFileContent(filePath);
      
      if (!content || content.trim().length === 0) {
        console.warn(`文件内容为空，跳过: ${filePath}`);
        continue;
      }

      // 创建初始 Document 对象
      const relativePath = path.relative(knowledgeDir, filePath);
      const fileName = path.basename(filePath);
      const initialDoc = new Document({
        pageContent: content,
        metadata: {
          source: relativePath,
          fileName: fileName,
        },
      });

      // 使用 splitDocuments 切分文档（会自动保留 metadata）
      const documents = await textSplitter.splitDocuments([initialDoc]);
      
      // 为每个文档块添加额外的元数据
      documents.forEach((doc, index) => {
        doc.metadata.chunkIndex = index;
        doc.metadata.totalChunks = documents.length;
      });

      allDocuments.push(...documents);
      console.log(`已加载文件: ${filePath} (${documents.length} 个块)`);
    } catch (error) {
      console.error(`处理文件失败: ${filePath}`, error);
      // 继续处理其他文件，不中断整个流程
      continue;
    }
  }

  console.log(`知识库加载完成，共 ${allDocuments.length} 个文档块`);
  return allDocuments;
}
