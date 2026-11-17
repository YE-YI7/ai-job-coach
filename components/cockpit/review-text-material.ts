/** Read only the declared text formats, in the browser. No upload, AI call or persistence. */
export async function readReviewTextMaterial(file: Pick<File, "name" | "size" | "text">): Promise<string> {
  if (!/\.(txt|md)$/i.test(file.name)) {
    throw new Error("目前支持 TXT 或 Markdown 转写稿；录音、PDF、Word 请先转成文字或直接粘贴。");
  }
  if (file.size > 1024 * 1024) throw new Error("文字文件请控制在 1MB 以内，已有记录不会被覆盖。");
  const text = await file.text();
  if (!text.trim()) throw new Error("文件里没有可读取的文字，已有记录保留。");
  if (text.includes("\u0000") || text.includes("\ufffd")) {
    throw new Error("文件编码暂时读不了，请另存为 UTF-8 文字或直接粘贴，已有记录保留。");
  }
  return text;
}

export function appendReviewMaterial(notes: string, material: string): string {
  return notes ? `${notes}\n\n${material}` : material;
}
