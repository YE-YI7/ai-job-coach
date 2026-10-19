import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import {
  RESUME_PHOTO_BUCKET,
  RESUME_PHOTO_LIMIT,
  ownsResumePhotoPath,
  resumePhotoBytesMime,
} from "@/lib/resume-photo";

export const runtime = "nodejs";
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function storage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("照片存储暂不可用");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > RESUME_PHOTO_LIMIT) return NextResponse.json({ ok: false, error: "请选择 1MB 以内的照片" }, { status: 400 });
    const bytes = await file.arrayBuffer();
    const mime = resumePhotoBytesMime(bytes);
    if (!mime) return NextResponse.json({ ok: false, error: "只支持 JPG、PNG 或 WebP 照片" }, { status: 400 });
    const store = storage();
    let bucket = await store.getBucket(RESUME_PHOTO_BUCKET);
    if (bucket.error) {
      const created = await store.createBucket(RESUME_PHOTO_BUCKET, { public: false, fileSizeLimit: RESUME_PHOTO_LIMIT, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
      if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;
      bucket = await store.getBucket(RESUME_PHOTO_BUCKET);
    }
    if (bucket.error || !bucket.data || bucket.data.public) throw Error("照片存储必须为私有");
    const path = `${user.id}/${crypto.randomUUID()}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
    const uploaded = await store.from(RESUME_PHOTO_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error) throw uploaded.error;
    // 上传不删除旧对象：关联保存失败时，旧照片必须仍然可读。
    return NextResponse.json({ ok: true, photo: { path, name: file.name.slice(0, 160), mime, size: file.size } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "照片没有保存，简历内容不受影响，请重试" }, { status: 503 }); }
}

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!ownsResumePhotoPath(user.id, path)) return NextResponse.json({ ok: false, error: "照片不存在" }, { status: 404 });
  try {
    const result = await storage().from(RESUME_PHOTO_BUCKET).download(path);
    if (result.error || !result.data) return NextResponse.json({ ok: false, error: "照片暂不可读取，请重试" }, { status: 404 });
    const mime = EXT_MIME[path.split(".").pop() || ""] || "application/octet-stream";
    return new Response(await result.data.arrayBuffer(), { headers: { "Content-Type": mime, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
  } catch { return NextResponse.json({ ok: false, error: "照片暂不可读取，请重试" }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!ownsResumePhotoPath(user.id, path)) return NextResponse.json({ ok: false, error: "照片不存在" }, { status: 404 });
  try {
    const db = await getDbClient();
    if (!db) throw Error("照片引用暂不可核对");
    const references = await db.from("coach_opportunities").select("id").eq("user_id",user.id).eq("metadata->resumePhoto->>path",path).limit(1);
    if (references.error) throw references.error;
    if (references.data?.length) return NextResponse.json({ok:true,retained:true},{headers:{"Cache-Control":"no-store"}});
    const removed = await storage().from(RESUME_PHOTO_BUCKET).remove([path]);
    if (removed.error) throw removed.error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "照片没有删除，请重试" }, { status: 503 }); }
}
