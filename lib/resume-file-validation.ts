const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateResumeFileType(filename: string, mimeType: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return [
    { extension: ".pdf", mimeType: "application/pdf" },
    { extension: ".doc", mimeType: "application/msword" },
    { extension: ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ].some((item) => lowerFilename.endsWith(item.extension) && mimeType === item.mimeType);
}

export function validateResumeFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}
