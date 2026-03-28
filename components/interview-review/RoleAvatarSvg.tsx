/**
 * 面试复盘 - 6 角色 SVG 形象图标
 * 风格：3D 粘土风（Clay / Claymorphism）
 * 圆润膨胀 + 内高光 + 软阴影 + 饱和色 + 光泽感
 */
"use client";

import type { ReviewRoleId } from "@/lib/interview-review/types";

interface RoleAvatarSvgProps {
  roleId: ReviewRoleId | "consensus";
  size?: number;
  className?: string;
}

/**
 * 共享 SVG filter：粘土质感
 * - 柔和投影（底部偏暗）
 * - 内高光（顶部亮斑模拟光源）
 */
function ClayFilters() {
  return (
    <defs>
      {/* 整体���和投影 — 双层阴影增强立体感 */}
      <filter id="clay-shadow" x="-15%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.10" />
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.06" />
      </filter>
      {/* 内发光（高光） */}
      <filter id="clay-inner-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
        <feOffset dx="0" dy="-2" result="offset" />
        <feComposite in="SourceGraphic" in2="offset" operator="atop" />
      </filter>
      {/* 顶部光泽 radial — 更集中的高光 */}
      <radialGradient id="clay-gloss" cx="0.38" cy="0.18" r="0.45">
        <stop offset="0%" stopColor="white" stopOpacity="0.6" />
        <stop offset="60%" stopColor="white" stopOpacity="0.15" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </radialGradient>
      {/* 底部暗部渐变 — 增强圆润立体感 */}
      <radialGradient id="clay-bottom-shade" cx="0.5" cy="0.85" r="0.5">
        <stop offset="0%" stopColor="#000" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      {/* 皮肤高光 — 更暖更亮 */}
      <radialGradient id="skin-highlight" cx="0.38" cy="0.25" r="0.55">
        <stop offset="0%" stopColor="#fff8ee" stopOpacity="0.9" />
        <stop offset="50%" stopColor="#fff5e6" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#fde8d0" stopOpacity="0" />
      </radialGradient>
      {/* 边缘高光 — 模拟环境光 */}
      <radialGradient id="clay-rim-light" cx="0.7" cy="0.15" r="0.6">
        <stop offset="0%" stopColor="white" stopOpacity="0.25" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** 粘土底盘：带阴影的圆形背景 */
function ClayBase({ gradient, stroke }: { gradient: string; stroke: string }) {
  return (
    <>
      {/* 底部阴影椭圆 — 更柔和的落地阴影 */}
      <ellipse cx="32" cy="61" rx="24" ry="3.5" fill="#000" opacity="0.05" />
      {/* 主圆 - 带柔和投影 */}
      <circle cx="32" cy="32" r="29" fill={`url(#${gradient})`} filter="url(#clay-shadow)" />
      {/* 底部暗部 — 增强球体感 */}
      <circle cx="32" cy="32" r="29" fill="url(#clay-bottom-shade)" />
      {/* 边缘描边 — 更柔和 */}
      <circle cx="32" cy="32" r="29" stroke={stroke} strokeWidth="1.2" fill="none" opacity="0.2" />
      {/* 顶部光泽层 — 主高光 */}
      <circle cx="32" cy="32" r="29" fill="url(#clay-gloss)" />
      {/* 右上环境�� */}
      <circle cx="32" cy="32" r="29" fill="url(#clay-rim-light)" />
    </>
  );
}

/** 粘土质感的脸 — 圆润膨胀，带高光和软阴影 */
function ClayFace({ cx = 32, cy = 30 }: { cx?: number; cy?: number }) {
  return (
    <>
      {/* 脸部阴影 — 更深更偏下 */}
      <ellipse cx={cx} cy={cy + 2.5} rx="12.5" ry="11.5" fill="#ddb896" opacity="0.25" />
      {/* 主脸 */}
      <ellipse cx={cx} cy={cy} rx="12" ry="11" fill="#fde8d0" />
      {/* 脸部主高光 — 左上偏移模拟光源 */}
      <ellipse cx={cx - 2} cy={cy - 3} rx="8" ry="6" fill="url(#skin-highlight)" />
      {/* 鼻梁微高光 — 增加立体感 */}
      <ellipse cx={cx} cy={cy + 1} rx="1.5" ry="2" fill="white" opacity="0.12" />
    </>
  );
}

/** 粘土风腮红 — 更大更柔和 */
function ClayBlush({ leftCx = 22, rightCx = 42, cy = 33 }: { leftCx?: number; rightCx?: number; cy?: number }) {
  return (
    <>
      {/* 外圈柔和扩散 */}
      <circle cx={leftCx} cy={cy} r="4" fill="#ffb3b3" opacity="0.15" />
      <circle cx={rightCx} cy={cy} r="4" fill="#ffb3b3" opacity="0.15" />
      {/* 核心腮红 */}
      <circle cx={leftCx} cy={cy} r="2.8" fill="#ff9a9a" opacity="0.35" />
      <circle cx={rightCx} cy={cy} r="2.8" fill="#ff9a9a" opacity="0.35" />
      {/* 腮红高光点 — 像真实粘土上的反光 */}
      <circle cx={leftCx - 0.5} cy={cy - 0.5} r="0.8" fill="white" opacity="0.2" />
      <circle cx={rightCx - 0.5} cy={cy - 0.5} r="0.8" fill="white" opacity="0.2" />
    </>
  );
}

/** 粘土风可爱眼睛 — 大而圆，双高光点 */
function ClayEyes({
  leftCx = 26, rightCx = 38, cy = 30, r = 2.2,
  style = "round",
}: {
  leftCx?: number; rightCx?: number; cy?: number; r?: number;
  style?: "round" | "happy" | "gentle" | "big" | "smart";
}) {
  if (style === "happy") {
    // 笑眯眼 — 弯弯的弧线
    return (
      <>
        <path d={`M${leftCx - 2.5} ${cy} c1-2.5 4-2.5 5 0`} stroke="#2d1810" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d={`M${rightCx - 2.5} ${cy} c1-2.5 4-2.5 5 0`} stroke="#2d1810" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </>
    );
  }

  if (style === "gentle") {
    // 温柔半闭 — 优雅弧线
    return (
      <>
        <path d={`M${leftCx - 2} ${cy} c0.5-2 3.5-2.5 4.5-0.5`} stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <path d={`M${rightCx - 2} ${cy} c0.5-2 3.5-2.5 4.5-0.5`} stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        {/* 小睫毛 */}
        <line x1={leftCx - 2} y1={cy - 0.5} x2={leftCx - 3} y2={cy - 2.5} stroke="#2d1810" strokeWidth="0.8" strokeLinecap="round" />
        <line x1={rightCx - 2} y1={cy - 0.5} x2={rightCx - 3} y2={cy - 2.5} stroke="#2d1810" strokeWidth="0.8" strokeLinecap="round" />
      </>
    );
  }

  if (style === "big") {
    // 大眼睛 — 更大更亮，3个高光点
    return (
      <>
        <circle cx={leftCx} cy={cy} r={r + 0.8} fill="#2d1810" />
        <circle cx={rightCx} cy={cy} r={r + 0.8} fill="#2d1810" />
        <circle cx={leftCx + 0.8} cy={cy - 0.8} r="1.2" fill="white" />
        <circle cx={rightCx + 0.8} cy={cy - 0.8} r="1.2" fill="white" />
        <circle cx={leftCx - 0.5} cy={cy + 0.8} r="0.5" fill="white" />
        <circle cx={rightCx - 0.5} cy={cy + 0.8} r="0.5" fill="white" />
      </>
    );
  }

  if (style === "smart") {
    // 聪明眼 — 略小但有神
    return (
      <>
        <circle cx={leftCx} cy={cy} r={r - 0.2} fill="#2d1810" />
        <circle cx={rightCx} cy={cy} r={r - 0.2} fill="#2d1810" />
        <circle cx={leftCx + 0.5} cy={cy - 0.5} r="0.7" fill="white" />
        <circle cx={rightCx + 0.5} cy={cy - 0.5} r="0.7" fill="white" />
      </>
    );
  }

  // round (default) — 标准可爱圆眼
  return (
    <>
      <circle cx={leftCx} cy={cy} r={r} fill="#2d1810" />
      <circle cx={rightCx} cy={cy} r={r} fill="#2d1810" />
      <circle cx={leftCx + 0.7} cy={cy - 0.6} r="0.9" fill="white" />
      <circle cx={rightCx + 0.7} cy={cy - 0.6} r="0.9" fill="white" />
      <circle cx={leftCx - 0.3} cy={cy + 0.5} r="0.35" fill="white" />
      <circle cx={rightCx - 0.3} cy={cy + 0.5} r="0.35" fill="white" />
    </>
  );
}

// ==================== 6 个角色 ====================

/** Kay - 行业资深总监：靛蓝色，短发黑框眼镜，犀利但可爱 */
function KayAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="kay-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#a5b4fc" />
        </radialGradient>
      </defs>
      <ClayBase gradient="kay-bg" stroke="#818cf8" />
      {/* 头发 — 厚实圆润 */}
      <path d="M17 24c0-9 6.5-15 15-15s15 6 15 15v3H17v-3z" fill="#1e293b" />
      <ellipse cx="32" cy="12" rx="12" ry="4" fill="#334155" opacity="0.3" />
      <ClayFace />
      {/* 圆润黑框眼镜 */}
      <circle cx="25.5" cy="30" r="5" fill="none" stroke="#1e293b" strokeWidth="2" />
      <circle cx="38.5" cy="30" r="5" fill="none" stroke="#1e293b" strokeWidth="2" />
      <line x1="30.5" y1="30" x2="33.5" y2="30" stroke="#1e293b" strokeWidth="1.5" />
      {/* 镜片光泽 */}
      <ellipse cx="24" cy="28.5" rx="2" ry="1.5" fill="white" opacity="0.15" />
      <ellipse cx="37" cy="28.5" rx="2" ry="1.5" fill="white" opacity="0.15" />
      <ClayEyes leftCx={25.5} rightCx={38.5} cy={30.5} r={1.8} style="smart" />
      {/* 微蹙眉 — 但可爱版 */}
      <path d="M22 26l3.5-1" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M42 26l-3.5-1" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
      {/* 嘴 — 微抿，略带思考 */}
      <path d="M28.5 36.5c1.5 0.5 4 0.5 5.5 0" stroke="#c0917a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <ClayBlush leftCx={19} rightCx={45} cy={33} />
      {/* 圆润衬衫 */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="#6366f1" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.3" />
      {/* 领带 */}
      <path d="M30.5 42v5l1.5 2.5 1.5-2.5v-5" fill="#312e81" />
      <ellipse cx="32" cy="42" rx="2" ry="1" fill="#4338ca" />
    </svg>
  );
}

/** Mia - 面霸学姐：翠绿色，齐肩短发，灿烂自信微笑 */
function MiaAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="mia-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </radialGradient>
      </defs>
      <ClayBase gradient="mia-bg" stroke="#34d399" />
      {/* 头发 — 蓬松齐肩 */}
      <path d="M16 28c0-10 7-18 16-18s16 8 16 18c0 2-1 12-2 15h-3c0-5 0.5-9 0.5-13 0-7-4.5-13-11.5-13S21 22 21 29c0 4 0.5 8 0.5 13h-3c-1-3-2.5-13-2.5-14z" fill="#5c3520" />
      {/* 发顶高光 */}
      <ellipse cx="30" cy="14" rx="8" ry="3" fill="#7a4e30" opacity="0.3" />
      <ClayFace />
      <ClayEyes style="happy" cy={30} />
      <ClayBlush leftCx={21} rightCx={43} cy={33} />
      {/* 嘴 — 开心大笑 */}
      <path d="M27 35.5c2.5 3 7 3 9.5 0" stroke="#c0917a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M28.5 36c2 1.5 5 1.5 7 0" fill="#e88c8c" opacity="0.5" />
      {/* 圆润上衣 */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="#10b981" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.3" />
      {/* V领 */}
      <path d="M28 42.5l4 4 4-4" fill="#059669" />
      {/* 竖大拇指 — 更圆润 */}
      <circle cx="48" cy="37" r="3.5" fill="#fde8d0" />
      <ellipse cx="48" cy="37" rx="3.5" ry="3.5" fill="url(#skin-highlight)" />
      <rect x="47" y="33.5" width="3" height="5.5" rx="1.5" fill="#fde8d0" />
    </svg>
  );
}

/** Rex - 实战派管理者：橙色，微卷发，帽衫，思考姿态 */
function RexAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="rex-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#ffedd5" />
          <stop offset="100%" stopColor="#fdba74" />
        </radialGradient>
      </defs>
      <ClayBase gradient="rex-bg" stroke="#fb923c" />
      {/* 卷发 — 更蓬松可爱的球球 */}
      <path d="M18 25c-1-9 6-16 14-16s15 7 14 16" fill="#5c3d1e" />
      <circle cx="20" cy="21" r="3.5" fill="#5c3d1e" />
      <circle cx="26" cy="15" r="3.5" fill="#5c3d1e" />
      <circle cx="32" cy="13" r="3.5" fill="#5c3d1e" />
      <circle cx="38" cy="15" r="3.5" fill="#5c3d1e" />
      <circle cx="44" cy="21" r="3.5" fill="#5c3d1e" />
      {/* 卷发高光 */}
      <circle cx="26" cy="14" r="1.5" fill="#7a5530" opacity="0.3" />
      <circle cx="38" cy="14" r="1.5" fill="#7a5530" opacity="0.3" />
      <ClayFace />
      <ClayEyes style="round" />
      {/* 一只眉挑起 — 可爱版 */}
      <path d="M23.5 25.5l4-1.5" stroke="#5c3d1e" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M40.5 26l-4-0.5" stroke="#5c3d1e" strokeWidth="1.3" strokeLinecap="round" />
      <ClayBlush />
      {/* 嘴 — 歪笑 */}
      <path d="M28 36c1 1.5 4 2 7 0.5" stroke="#c0917a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* 帽衫 */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="#78716c" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.25" />
      {/* 帽衫领口 */}
      <path d="M27 42c2 2.5 6 3 9 1" fill="#57534e" />
      {/* 拉绳 */}
      <line x1="29" y1="44" x2="29" y2="50" stroke="#d6d3d1" strokeWidth="1" strokeLinecap="round" />
      <line x1="35" y1="44" x2="35" y2="50" stroke="#d6d3d1" strokeWidth="1" strokeLinecap="round" />
      {/* 托下巴 — 圆润小手 */}
      <ellipse cx="20.5" cy="35.5" rx="3.5" ry="2.5" fill="#fde8d0" />
      <ellipse cx="20.5" cy="35.5" rx="3.5" ry="2.5" fill="url(#skin-highlight)" />
    </svg>
  );
}

/** Vivi - 资深猎头：紫色，优雅盘发，耳饰，知性 */
function ViviAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="vivi-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </radialGradient>
      </defs>
      <ClayBase gradient="vivi-bg" stroke="#a78bfa" />
      {/* 盘发 — 更圆润立体 */}
      <ellipse cx="32" cy="17" rx="11" ry="9" fill="#1a1a2e" />
      <circle cx="32" cy="11" r="6" fill="#1a1a2e" />
      {/* 发髻高光 */}
      <ellipse cx="30" cy="10" rx="3" ry="2" fill="#2d2d4e" opacity="0.4" />
      {/* 发簪 */}
      <line x1="27" y1="10" x2="37" y2="12.5" stroke="#e9d5ff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="27" cy="10" r="2" fill="#c084fc" />
      <circle cx="27" cy="10" r="1" fill="#e9d5ff" opacity="0.5" />
      <ClayFace />
      {/* 耳饰 — 更精致 */}
      <circle cx="19.5" cy="32" r="2" fill="#c084fc" />
      <circle cx="19.5" cy="32" r="0.8" fill="#e9d5ff" opacity="0.5" />
      <circle cx="44.5" cy="32" r="2" fill="#c084fc" />
      <circle cx="44.5" cy="32" r="0.8" fill="#e9d5ff" opacity="0.5" />
      <ClayEyes style="gentle" cy={29.5} />
      <ClayBlush leftCx={22} rightCx={42} />
      {/* 嘴 — 优雅微笑 */}
      <path d="M28.5 35.5c2 2 5.5 2 7.5 0" stroke="#d4908a" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* 西装 */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="#8b5cf6" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.3" />
      {/* V领 + 翻领 */}
      <path d="M27.5 42l4.5 5 4.5-5" fill="#7c3aed" />
      <path d="M25 42l3 3.5-1.5 3" fill="#a78bfa" opacity="0.7" />
      <path d="M39 42l-3 3.5 1.5 3" fill="#a78bfa" opacity="0.7" />
    </svg>
  );
}

/** Coco - 同期求职者：珊瑚粉，马尾辫，活泼可爱 */
function CocoAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="coco-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#ffe4e6" />
          <stop offset="100%" stopColor="#fda4af" />
        </radialGradient>
      </defs>
      <ClayBase gradient="coco-bg" stroke="#fb7185" />
      {/* 马尾 — 圆润弧线 */}
      <path d="M38 17c4 0 9-2 11 3s1 11-1 15" stroke="#3d2c1e" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* 头发 */}
      <path d="M19 26c0-9 6-16 13-16s13 7 13 16" fill="#3d2c1e" />
      {/* 发顶高光 */}
      <ellipse cx="29" cy="14" rx="6" ry="3" fill="#5c4530" opacity="0.3" />
      {/* 刘海 — 更蓬松 */}
      <path d="M20 26c1-3.5 5.5-5.5 9-4" fill="#3d2c1e" />
      <path d="M44 26c-1-3.5-5.5-5.5-9-4" fill="#3d2c1e" />
      {/* 发饰小球 */}
      <circle cx="40" cy="15" r="2.5" fill="#fb7185" />
      <circle cx="40" cy="15" r="1" fill="#fecdd3" opacity="0.6" />
      <ClayFace cy={31} />
      <ClayEyes style="big" leftCx={27} rightCx={37} cy={30} />
      <ClayBlush leftCx={21} rightCx={43} cy={34} />
      {/* 嘴 — 开心张嘴笑 */}
      <ellipse cx="32" cy="37" rx="3.5" ry="2.5" fill="#f9a8a8" />
      <ellipse cx="32" cy="36.2" rx="3.5" ry="1.2" fill="white" />
      {/* 白T */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="white" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.2" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" stroke="#f1f5f9" strokeWidth="0.5" fill="none" />
      {/* 牛仔外套 */}
      <path d="M19 44c2.5-1.5 5-2.5 7-2.5v11h-7v-8.5z" fill="#60a5fa" />
      <path d="M45 44c-2.5-1.5-5-2.5-7-2.5v11h7v-8.5z" fill="#60a5fa" />
      {/* 挥手 — 圆润小手 */}
      <circle cx="49" cy="34" r="3" fill="#fde8d0" />
      <ellipse cx="49" cy="34" rx="3" ry="3" fill="url(#skin-highlight)" />
      <path d="M47.5 31l2-3.5" stroke="#fde8d0" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M50 31.5l1-3.5" stroke="#fde8d0" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Prof. Lu - 高校导师：琥珀色，花白头发，圆金丝眼镜，慈祥 */
function LuAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="lu-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#fde68a" />
        </radialGradient>
      </defs>
      <ClayBase gradient="lu-bg" stroke="#fbbf24" />
      {/* 花白头发 — 蓬松 */}
      <path d="M18 25c0-10 6-16 14-16s14 6 14 16" fill="#94a3b8" />
      {/* 白发挑染 */}
      <path d="M20 23c2-6 5.5-9 9-9" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M36 15c3 0 6.5 2.5 8.5 8" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {/* 发顶高光 */}
      <ellipse cx="32" cy="13" rx="8" ry="3" fill="#b0bec5" opacity="0.3" />
      <ClayFace />
      {/* 圆形金丝眼镜 — 更圆润 */}
      <circle cx="26" cy="29.5" r="5.5" fill="none" stroke="#d4a017" strokeWidth="1.5" />
      <circle cx="38" cy="29.5" r="5.5" fill="none" stroke="#d4a017" strokeWidth="1.5" />
      <line x1="31.5" y1="29.5" x2="32.5" y2="29.5" stroke="#d4a017" strokeWidth="1.2" />
      {/* 镜片光泽 */}
      <ellipse cx="24.5" cy="28" rx="2" ry="1.5" fill="white" opacity="0.15" />
      <ellipse cx="36.5" cy="28" rx="2" ry="1.5" fill="white" opacity="0.15" />
      <ClayEyes leftCx={26} rightCx={38} cy={30} r={1.8} style="smart" />
      <ClayBlush leftCx={19} rightCx={45} cy={34} />
      {/* 慈祥微笑 */}
      <path d="M28 36.5c2 2 5.5 2 7.5 0" stroke="#c0917a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* 格子西装 */}
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="#a16207" />
      <path d="M19 44c0 0 4-3 13-3s13 3 13 3v9H19v-9z" fill="url(#clay-gloss)" opacity="0.25" />
      {/* 格子纹理 */}
      <line x1="24" y1="44" x2="24" y2="53" stroke="#854d0e" strokeWidth="0.6" opacity="0.25" />
      <line x1="28" y1="43" x2="28" y2="53" stroke="#854d0e" strokeWidth="0.6" opacity="0.25" />
      <line x1="36" y1="43" x2="36" y2="53" stroke="#854d0e" strokeWidth="0.6" opacity="0.25" />
      <line x1="40" y1="44" x2="40" y2="53" stroke="#854d0e" strokeWidth="0.6" opacity="0.25" />
      <line x1="19" y1="47.5" x2="45" y2="47.5" stroke="#854d0e" strokeWidth="0.6" opacity="0.25" />
      {/* 领结 — 更可爱 */}
      <path d="M29.5 42l2.5 2 2.5-2-2.5-1.5z" fill="#ca8a04" />
      <path d="M34.5 42l-2.5 2-2.5-2 2.5-1.5z" fill="#ca8a04" />
      <circle cx="32" cy="42" r="1.2" fill="#a16207" />
    </svg>
  );
}

/** 共识图标 — 粘土风星星 */
function ConsensusAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ClayFilters />
      <defs>
        <radialGradient id="consensus-bg" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#fde68a" />
        </radialGradient>
      </defs>
      <ClayBase gradient="consensus-bg" stroke="#fbbf24" />
      {/* 星星 — 带高光 */}
      <path d="M32 16l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#f59e0b" filter="url(#clay-shadow)" />
      <path d="M32 16l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="url(#clay-gloss)" opacity="0.4" />
      {/* 勾 */}
      <path d="M24 33l5 5 10-12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 空状态插图 - 6个角色围坐讨论（粘土风） */
export function EmptyStateIllustration({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 背景 */}
      <rect width="200" height="140" rx="20" fill="#fafaf9" />
      {/* 圆桌 — 带阴影 */}
      <ellipse cx="100" cy="98" rx="55" ry="8" fill="#000" opacity="0.04" />
      <ellipse cx="100" cy="95" rx="60" ry="15" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />
      {/* 对话气泡 — 更圆润 */}
      <rect x="68" y="18" width="64" height="28" rx="14" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <path d="M95 46l6 8 6-8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="80" y1="28" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="80" y1="35" x2="112" y2="35" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
      {/* 6个小人围坐 — 粘土风简化版 */}
      {/* Kay */}
      <circle cx="55" cy="72" r="9" fill="#e0e7ff" />
      <circle cx="55" cy="70" r="4.5" fill="#fde8d0" />
      <circle cx="53.5" cy="69.5" r="0.8" fill="#2d1810" />
      <circle cx="56.5" cy="69.5" r="0.8" fill="#2d1810" />
      {/* Mia */}
      <circle cx="80" cy="65" r="9" fill="#d1fae5" />
      <circle cx="80" cy="63" r="4.5" fill="#fde8d0" />
      <path d="M78 63c0.5-1 1.5-1 2 0" stroke="#2d1810" strokeWidth="1" strokeLinecap="round" />
      <path d="M82 63c0.5-1 1.5-1 2 0" stroke="#2d1810" strokeWidth="1" strokeLinecap="round" />
      {/* Rex */}
      <circle cx="120" cy="65" r="9" fill="#ffedd5" />
      <circle cx="120" cy="63" r="4.5" fill="#fde8d0" />
      <circle cx="118.5" cy="63" r="0.8" fill="#2d1810" />
      <circle cx="121.5" cy="63" r="0.8" fill="#2d1810" />
      {/* Vivi */}
      <circle cx="145" cy="72" r="9" fill="#ede9fe" />
      <circle cx="145" cy="70" r="4.5" fill="#fde8d0" />
      <path d="M143 70c0.5-1 1.5-1.2 2 0" stroke="#2d1810" strokeWidth="1" strokeLinecap="round" />
      <path d="M147 70c0.5-1 1.5-1.2 2 0" stroke="#2d1810" strokeWidth="1" strokeLinecap="round" />
      {/* Coco */}
      <circle cx="68" cy="85" r="9" fill="#ffe4e6" />
      <circle cx="68" cy="83" r="4.5" fill="#fde8d0" />
      <circle cx="66.5" cy="83" r="1" fill="#2d1810" />
      <circle cx="69.5" cy="83" r="1" fill="#2d1810" />
      <circle cx="67" cy="82.5" r="0.4" fill="white" />
      <circle cx="70" cy="82.5" r="0.4" fill="white" />
      {/* Lu */}
      <circle cx="132" cy="85" r="9" fill="#fef9c3" />
      <circle cx="132" cy="83" r="4.5" fill="#fde8d0" />
      <circle cx="130" cy="83" r="2.8" fill="none" stroke="#d4a017" strokeWidth="0.7" />
      <circle cx="134" cy="83" r="2.8" fill="none" stroke="#d4a017" strokeWidth="0.7" />
      {/* 文件 */}
      <rect x="89" y="80" width="9" height="11" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="0.7" />
      <rect x="102" y="80" width="9" height="11" rx="2" fill="white" stroke="#e2e8f0" strokeWidth="0.7" />
    </svg>
  );
}

/** 主组件 */
export default function RoleAvatarSvg({ roleId, size = 40, className }: RoleAvatarSvgProps) {
  const avatarMap: Record<string, (props: { size: number }) => React.ReactElement> = {
    kay: KayAvatar,
    mia: MiaAvatar,
    rex: RexAvatar,
    vivi: ViviAvatar,
    coco: CocoAvatar,
    lu: LuAvatar,
    consensus: ConsensusAvatar,
  };

  const AvatarComponent = avatarMap[roleId];
  if (!AvatarComponent) return null;

  return (
    <div className={className} style={{ width: size, height: size, flexShrink: 0 }}>
      <AvatarComponent size={size} />
    </div>
  );
}
