import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ORIGINAL_RESUME_BUCKET, ORIGINAL_RESUME_LIMIT, originalResumeMime, ownsOriginalResumePath } from "@/lib/resume-original";

export const runtime = "nodejs";
function storage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("原文件存储暂不可用");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}}).storage;
}
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ok:false,error:"未认证"},{status:401});
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > ORIGINAL_RESUME_LIMIT) return NextResponse.json({ok:false,error:"请选择不超过 4MB 的简历文件"},{status:400});
    const mime = originalResumeMime(file.name);
    if (!mime) return NextResponse.json({ok:false,error:"支持 PDF、DOCX、TXT 和 Markdown"},{status:400});
    const bytes = await file.arrayBuffer();
    if (mime === "application/pdf" && new TextDecoder().decode(bytes.slice(0,5)) !== "%PDF-") return NextResponse.json({ok:false,error:"这不是有效的 PDF 文件"},{status:400});
    const store = storage();
    let bucket = await store.getBucket(ORIGINAL_RESUME_BUCKET);
    if (bucket.error) {
      const created = await store.createBucket(ORIGINAL_RESUME_BUCKET,{public:false,fileSizeLimit:ORIGINAL_RESUME_LIMIT,allowedMimeTypes:["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","text/plain"]});
      if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;
      bucket = await store.getBucket(ORIGINAL_RESUME_BUCKET);
    }
    if (bucket.error || !bucket.data || bucket.data.public) throw Error("原文件存储必须为私有");
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.toLowerCase().split(".").pop()}`;
    const uploaded = await store.from(ORIGINAL_RESUME_BUCKET).upload(path,bytes,{contentType:mime,upsert:false});
    if (uploaded.error) throw uploaded.error;
    return NextResponse.json({ok:true,original:{path,name:file.name.slice(0,160),mime,size:file.size}},{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({ok:false,error:"原文件暂未保存，请重试；原简历未被覆盖"},{status:503}); }
}
export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ok:false,error:"未认证"},{status:401});
  const url = new URL(request.url), path = url.searchParams.get("path") || "";
  if (!ownsOriginalResumePath(user.id,path)) return NextResponse.json({ok:false,error:"文件不存在"},{status:404});
  try {
    const result = await storage().from(ORIGINAL_RESUME_BUCKET).download(path);
    if (result.error || !result.data) return NextResponse.json({ok:false,error:"原文件暂不可读取，请重试"},{status:404});
    const mime = originalResumeMime(path)!;
    const disposition = url.searchParams.get("download") === "1" || mime.includes("wordprocessingml") ? "attachment" : "inline";
    const name = (url.searchParams.get("name") || "resume").slice(0,160);
    return new Response(await result.data.arrayBuffer(),{headers:{"Content-Type":mime,"Content-Disposition":`${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"frame-ancestors 'self'"}});
  } catch { return NextResponse.json({ok:false,error:"原文件暂不可读取，请重试"},{status:503}); }
}
