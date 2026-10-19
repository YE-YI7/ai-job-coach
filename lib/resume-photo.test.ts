import { ownsResumePhotoPath, prepareResumePhotoFile, resumePhotoBytesMime, resumePhotoMime } from "./resume-photo";

const OWNER = "11111111-2222-3333-4444-555555555555";
const UUID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const bytes = (...values: number[]) => new Uint8Array(values).buffer;

test("损坏的照片给出可重试的中文提示，不泄漏浏览器解码异常", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: jest.fn().mockRejectedValue(new Error("The source image could not be decoded.")) });
  try {
    await expect(prepareResumePhotoFile({} as File)).rejects.toThrow("这张照片无法读取，请换一张 JPG、PNG 或 WebP 图片后重试。原照片未更改。");
  } finally {
    if (original) Object.defineProperty(globalThis, "createImageBitmap", original);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});

test("照片路径只认当前账号下的图片对象：越界路径、别人的目录、非图片扩展名都拒绝", () => {
  expect(ownsResumePhotoPath(OWNER, `${OWNER}/${UUID}.jpg`)).toBe(true);
  expect(ownsResumePhotoPath(OWNER, `${OWNER}/${UUID}.webp`)).toBe(true);
  expect(ownsResumePhotoPath(OWNER, `22222222-2222-3333-4444-555555555555/${UUID}.jpg`)).toBe(false);
  expect(ownsResumePhotoPath(OWNER, `${OWNER}/${UUID}.svg`)).toBe(false);
  expect(ownsResumePhotoPath(OWNER, `${OWNER}/${UUID}.jpg/../x.jpg`)).toBe(false);
  expect(ownsResumePhotoPath(OWNER, `${OWNER}/..%2F${UUID}.jpg`)).toBe(false);
  expect(ownsResumePhotoPath(OWNER, "")).toBe(false);
});

test("照片类型看字节头不看文件名：伪装成 jpg 的脚本不是图片", () => {
  expect(resumePhotoBytesMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe("image/jpeg");
  expect(resumePhotoBytesMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  expect(resumePhotoBytesMime(bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  expect(resumePhotoBytesMime(new TextEncoder().encode("<svg onload=alert(1)>").buffer)).toBe(null);
  expect(resumePhotoBytesMime(new TextEncoder().encode("%PDF-1.4").buffer)).toBe(null);
});

test("扩展名白名单与桶内扩展名一致，大写文件名照常识别", () => {
  expect(resumePhotoMime("证件照.JPG")).toBe("image/jpeg");
  expect(resumePhotoMime("me.webp")).toBe("image/webp");
  expect(resumePhotoMime("resume.pdf")).toBe(null);
  expect(resumePhotoMime("photo.svg")).toBe(null);
});
