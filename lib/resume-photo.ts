import type { Opportunity } from "./opportunities/types";

export type ResumePhoto = NonNullable<Opportunity["resumePhoto"]>;
export const RESUME_PHOTO_BUCKET = "resume-photos";
export const RESUME_PHOTO_LIMIT = 1024 * 1024;
// 纸面上照片只占右上角 22×28mm，压到 800px 长边足够清晰，也避免手机原片直接进存储。
export const RESUME_PHOTO_MAX_EDGE = 800;

export function resumePhotoMime(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : null;
}
export function ownsResumePhotoPath(owner: string, path: string) {
  return path.startsWith(`${owner}/`) && /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(path.slice(owner.length + 1));
}
/** 只认字节头，不看扩展名：SVG 能带脚本，伪装成图片的 HTML 更不能内联返回。 */
export function resumePhotoBytesMime(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes.slice(0, 12));
  const at = (offset: number, ...expected: number[]) => expected.every((value, index) => head[offset + index] === value);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
/** 浏览器侧先缩放并重编码成 JPEG；透明 PNG 压平到白底，打印纸上不能出黑块。 */
export async function prepareResumePhotoFile(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("这张照片无法读取，请换一张 JPG、PNG 或 WebP 图片后重试。原照片未更改。");
  }
  const scale = Math.min(1, RESUME_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("这台设备的浏览器无法处理图片，请换一张或换台设备");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw Error("这张照片没能压缩，请换一张");
  return new File([blob], "证件照.jpg", { type: "image/jpeg" });
}
export async function uploadResumePhoto(file: File): Promise<ResumePhoto> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/coach/resume-photo", { method: "POST", body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.photo) throw Error(result.error || "照片没有保存，请重试");
  return result.photo as ResumePhoto;
}
export async function deleteResumePhoto(path: string): Promise<void> {
  const response = await fetch(`/api/coach/resume-photo?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw Error(result.error || "照片没有删除，请重试");
}

/**
 * 打印窗口是 about:blank，相对地址取不到私有桶；纸面与 PDF 要长得一样，
 * 所以统一把照片换成 data URI 再交给同一个渲染器。
 */
export async function resumePhotoDataUri(path: string): Promise<string> {
    const response = await fetch(`/api/coach/resume-photo?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    if (!response.ok) throw Error("照片读取失败");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
}
