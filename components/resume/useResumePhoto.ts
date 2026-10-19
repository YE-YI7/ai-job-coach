"use client";

import { useEffect, useState } from "react";
import { resumePhotoDataUri, type ResumePhoto } from "@/lib/resume-photo";

/** 路径切换后不短暂显示上一份简历的照片；每次读取仍验证当前账号。 */
export function useResumePhoto(photo?: ResumePhoto): string {
  const path = photo?.path || "";
  const [loaded, setLoaded] = useState({path:"",dataUri:""});
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void resumePhotoDataUri(path).then((dataUri) => { if (alive) setLoaded({path,dataUri}); }, () => { if (alive) setLoaded({path,dataUri:""}); });
    return () => { alive = false; };
  }, [path]);
  return loaded.path===path ? loaded.dataUri : "";
}
