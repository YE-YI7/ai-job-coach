/**
 * 面试复盘 - 6 角色 SVG 形象图标
 * 风格：简约卡通矢量，圆润几何，浅色基底 + 轻渐变，可爱有特色
 */
"use client";

import type { ReviewRoleId } from "@/lib/interview-review/types";

interface RoleAvatarSvgProps {
  roleId: ReviewRoleId | "consensus";
  size?: number;
  className?: string;
}

/** Kay - 大厂技术总监：靛蓝色，短发黑框眼镜，严肃自信 */
function KayAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kay-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#kay-bg)" stroke="#a5b4fc" strokeWidth="2" />
      {/* 头发 */}
      <path d="M18 24c0-8 6-14 14-14s14 6 14 14v2H18v-2z" fill="#1e293b" />
      {/* 脸 */}
      <ellipse cx="32" cy="30" rx="12" ry="11" fill="#fde8d0" />
      {/* 眼镜框 */}
      <rect x="21" y="27" width="9" height="7" rx="2" fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <rect x="34" y="27" width="9" height="7" rx="2" fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <line x1="30" y1="30" x2="34" y2="30" stroke="#1e293b" strokeWidth="1.2" />
      {/* 眼睛 */}
      <circle cx="25.5" cy="30.5" r="1.5" fill="#1e293b" />
      <circle cx="38.5" cy="30.5" r="1.5" fill="#1e293b" />
      <circle cx="26" cy="30" r="0.5" fill="white" />
      <circle cx="39" cy="30" r="0.5" fill="white" />
      {/* 微蹙眉 */}
      <path d="M22 26l4-1" stroke="#475569" strokeWidth="1" strokeLinecap="round" />
      <path d="M42 26l-4-1" stroke="#475569" strokeWidth="1" strokeLinecap="round" />
      {/* 嘴 */}
      <path d="M28 36h8" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
      {/* 衬衫领 */}
      <path d="M22 42l10 6 10-6" fill="#4f46e5" stroke="#4338ca" strokeWidth="0.5" />
      <path d="M20 44c0 0 4-2 12-2s12 2 12 2v8H20v-8z" fill="#4f46e5" />
      {/* 领带 */}
      <path d="M31 42v6l1 2 1-2v-6" fill="#312e81" />
    </svg>
  );
}

/** Mia - 面霸学姐：翠绿色，齐肩短发，灿烂自信微笑 */
function MiaAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mia-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#mia-bg)" stroke="#6ee7b7" strokeWidth="2" />
      {/* 头发 */}
      <path d="M16 28c0-10 7-18 16-18s16 8 16 18c0 2-1 12-2 16h-4c0-6 1-10 1-14 0-6-4-12-11-12S21 22 21 28c0 4 1 8 1 14h-4c-1-4-2-14-2-14z" fill="#422006" />
      {/* 脸 */}
      <ellipse cx="32" cy="31" rx="11" ry="11" fill="#fde8d0" />
      {/* 眼睛 - 笑眯 */}
      <path d="M24 30c1-2 3-2 4 0" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M36 30c1-2 3-2 4 0" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
      {/* 腮红 */}
      <circle cx="22" cy="33" r="2.5" fill="#fecdd3" opacity="0.5" />
      <circle cx="42" cy="33" r="2.5" fill="#fecdd3" opacity="0.5" />
      {/* 嘴 - 开心 */}
      <path d="M27 35c2 3 6 3 8 0" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* 上衣 */}
      <path d="M20 44c0 0 4-3 12-3s12 3 12 3v8H20v-8z" fill="#059669" />
      {/* V领 */}
      <path d="M28 42l4 4 4-4" fill="#047857" />
      {/* 竖大拇指 */}
      <circle cx="48" cy="38" r="3" fill="#fde8d0" stroke="#f5deb3" strokeWidth="0.5" />
      <rect x="47" y="35" width="2.5" height="5" rx="1" fill="#fde8d0" />
    </svg>
  );
}

/** Rex - 创业公司CTO：橙色，微卷发，帽衫，思考姿态 */
function RexAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rex-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="100%" stopColor="#fed7aa" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#rex-bg)" stroke="#fdba74" strokeWidth="2" />
      {/* 卷发 */}
      <path d="M18 25c-1-9 6-16 14-16s15 7 14 16" fill="#5c3d1e" />
      <circle cx="20" cy="22" r="3" fill="#5c3d1e" />
      <circle cx="26" cy="16" r="3" fill="#5c3d1e" />
      <circle cx="32" cy="14" r="3" fill="#5c3d1e" />
      <circle cx="38" cy="16" r="3" fill="#5c3d1e" />
      <circle cx="44" cy="22" r="3" fill="#5c3d1e" />
      {/* 脸 */}
      <ellipse cx="32" cy="30" rx="12" ry="11" fill="#fde8d0" />
      {/* 眼睛 */}
      <circle cx="27" cy="29" r="2" fill="#1e293b" />
      <circle cx="37" cy="29" r="2" fill="#1e293b" />
      <circle cx="27.5" cy="28.5" r="0.7" fill="white" />
      <circle cx="37.5" cy="28.5" r="0.7" fill="white" />
      {/* 一只眉挑起 */}
      <path d="M24 25l4-2" stroke="#5c3d1e" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M40 25l-4-1" stroke="#5c3d1e" strokeWidth="1.2" strokeLinecap="round" />
      {/* 嘴 - 歪笑 */}
      <path d="M28 36c1 1 3 2 6 1" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* 帽衫 */}
      <path d="M20 44c0 0 4-3 12-3s12 3 12 3v8H20v-8z" fill="#6b7280" />
      {/* 帽衫领口 */}
      <path d="M27 42c2 2 5 3 8 1" fill="#4b5563" />
      {/* 拉绳 */}
      <line x1="29" y1="44" x2="29" y2="50" stroke="#d1d5db" strokeWidth="0.8" />
      <line x1="35" y1="44" x2="35" y2="50" stroke="#d1d5db" strokeWidth="0.8" />
      {/* 托下巴的手 */}
      <ellipse cx="21" cy="36" rx="3" ry="2" fill="#fde8d0" />
    </svg>
  );
}

/** Vivi - 资深猎头：紫色，优雅盘发，耳饰，知性 */
function ViviAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vivi-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#ddd6fe" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#vivi-bg)" stroke="#c4b5fd" strokeWidth="2" />
      {/* 盘发 */}
      <ellipse cx="32" cy="18" rx="10" ry="8" fill="#1a1a2e" />
      <circle cx="32" cy="12" r="5" fill="#1a1a2e" />
      {/* 发簪 */}
      <line x1="28" y1="11" x2="36" y2="13" stroke="#ddd6fe" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="28" cy="11" r="1.5" fill="#c084fc" />
      {/* 脸 */}
      <ellipse cx="32" cy="30" rx="11" ry="11" fill="#fde8d0" />
      {/* 耳饰 */}
      <circle cx="20" cy="32" r="1.5" fill="#c084fc" />
      <circle cx="44" cy="32" r="1.5" fill="#c084fc" />
      {/* 眼睛 - 优雅半闭 */}
      <path d="M24 29c0.5-1.5 3-2 4-0.5" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M36 29c0.5-1.5 3-2 4-0.5" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* 睫毛 */}
      <line x1="24" y1="28" x2="23" y2="26" stroke="#1e293b" strokeWidth="0.8" />
      <line x1="36" y1="28" x2="35" y2="26" stroke="#1e293b" strokeWidth="0.8" />
      {/* 腮红 */}
      <circle cx="23" cy="33" r="2" fill="#fecdd3" opacity="0.4" />
      <circle cx="41" cy="33" r="2" fill="#fecdd3" opacity="0.4" />
      {/* 嘴 - 微笑 */}
      <path d="M28 35c2 2 5 2 7 0" stroke="#e879a0" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* 西装 */}
      <path d="M20 44c0 0 4-3 12-3s12 3 12 3v8H20v-8z" fill="#7c3aed" />
      {/* V领 */}
      <path d="M27 42l5 5 5-5" fill="#6d28d9" />
      {/* 翻领 */}
      <path d="M25 42l3 3-2 3" fill="#8b5cf6" />
      <path d="M39 42l-3 3 2 3" fill="#8b5cf6" />
    </svg>
  );
}

/** Coco - 同期求职者：珊瑚粉，马尾辫，活泼紧张但积极 */
function CocoAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coco-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#fff1f2" />
          <stop offset="100%" stopColor="#fecdd3" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#coco-bg)" stroke="#fda4af" strokeWidth="2" />
      {/* 马尾 */}
      <path d="M38 18c4 0 8-2 10 2s1 10-1 14" stroke="#3d2c1e" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* 头发 */}
      <path d="M19 26c0-9 6-16 13-16s13 7 13 16" fill="#3d2c1e" />
      {/* 刘海 */}
      <path d="M20 26c1-3 5-5 8-4" fill="#3d2c1e" />
      <path d="M44 26c-1-3-5-5-8-4" fill="#3d2c1e" />
      {/* 脸 */}
      <ellipse cx="32" cy="31" rx="11" ry="11" fill="#fde8d0" />
      {/* 眼睛 - 圆大亮 */}
      <circle cx="27" cy="30" r="2.5" fill="#1e293b" />
      <circle cx="37" cy="30" r="2.5" fill="#1e293b" />
      <circle cx="27.8" cy="29.2" r="1" fill="white" />
      <circle cx="37.8" cy="29.2" r="1" fill="white" />
      <circle cx="26.5" cy="30.5" r="0.4" fill="white" />
      <circle cx="36.5" cy="30.5" r="0.4" fill="white" />
      {/* 腮红 */}
      <circle cx="22" cy="34" r="2.5" fill="#fecdd3" opacity="0.6" />
      <circle cx="42" cy="34" r="2.5" fill="#fecdd3" opacity="0.6" />
      {/* 嘴 - 开心张嘴 */}
      <ellipse cx="32" cy="37" rx="3" ry="2" fill="#fca5a5" />
      <ellipse cx="32" cy="36.5" rx="3" ry="1" fill="white" />
      {/* 白T */}
      <path d="M20 44c0 0 4-3 12-3s12 3 12 3v8H20v-8z" fill="white" stroke="#e5e7eb" strokeWidth="0.5" />
      {/* 牛仔外套 */}
      <path d="M20 44c2-1 4-2 6-2v10h-6v-8z" fill="#60a5fa" />
      <path d="M44 44c-2-1-4-2-6-2v10h6v-8z" fill="#60a5fa" />
      {/* 挥手 */}
      <circle cx="48" cy="35" r="2.5" fill="#fde8d0" />
      <path d="M47 32l2-3" stroke="#fde8d0" strokeWidth="2" strokeLinecap="round" />
      <path d="M49 32l1-3" stroke="#fde8d0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Prof. Lu - 高校导师：琥珀色，花白头发，圆金丝眼镜，格子西装 */
function LuAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lu-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#lu-bg)" stroke="#fbbf24" strokeWidth="2" />
      {/* 花白头发 */}
      <path d="M19 25c0-9 6-15 13-15s13 6 13 15" fill="#94a3b8" />
      <path d="M20 24c2-6 5-8 8-8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M36 16c3 0 6 2 8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      {/* 脸 */}
      <ellipse cx="32" cy="30" rx="12" ry="11" fill="#fde8d0" />
      {/* 圆形金丝眼镜 */}
      <circle cx="26" cy="29" r="5" fill="none" stroke="#d4a017" strokeWidth="1.2" />
      <circle cx="38" cy="29" r="5" fill="none" stroke="#d4a017" strokeWidth="1.2" />
      <line x1="31" y1="29" x2="33" y2="29" stroke="#d4a017" strokeWidth="1" />
      {/* 镜腿 */}
      <line x1="21" y1="29" x2="18" y2="28" stroke="#d4a017" strokeWidth="1" />
      <line x1="43" y1="29" x2="46" y2="28" stroke="#d4a017" strokeWidth="1" />
      {/* 眼睛 */}
      <circle cx="26" cy="29.5" r="1.5" fill="#1e293b" />
      <circle cx="38" cy="29.5" r="1.5" fill="#1e293b" />
      <circle cx="26.5" cy="29" r="0.5" fill="white" />
      <circle cx="38.5" cy="29" r="0.5" fill="white" />
      {/* 慈祥微笑 */}
      <path d="M28 36c2 1.5 5 1.5 7 0" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* 格子西装 */}
      <path d="M20 44c0 0 4-3 12-3s12 3 12 3v8H20v-8z" fill="#92400e" />
      {/* 格子纹理 */}
      <line x1="24" y1="44" x2="24" y2="52" stroke="#78350f" strokeWidth="0.5" opacity="0.3" />
      <line x1="28" y1="43" x2="28" y2="52" stroke="#78350f" strokeWidth="0.5" opacity="0.3" />
      <line x1="36" y1="43" x2="36" y2="52" stroke="#78350f" strokeWidth="0.5" opacity="0.3" />
      <line x1="40" y1="44" x2="40" y2="52" stroke="#78350f" strokeWidth="0.5" opacity="0.3" />
      <line x1="20" y1="47" x2="44" y2="47" stroke="#78350f" strokeWidth="0.5" opacity="0.3" />
      {/* 领结 */}
      <path d="M30 42l2 2 2-2-2-1.5z" fill="#b45309" />
      <path d="M34 42l-2 2-2-2 2-1.5z" fill="#b45309" />
      <circle cx="32" cy="42" r="1" fill="#92400e" />
    </svg>
  );
}

/** 共识图标 */
function ConsensusAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="consensus-bg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#consensus-bg)" stroke="#fcd34d" strokeWidth="2" />
      {/* 星星 */}
      <path d="M32 16l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#f59e0b" />
      {/* 勾 */}
      <path d="M24 33l5 5 10-12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 空状态插图 - 6个角色围坐讨论 */
export function EmptyStateIllustration({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 背景 */}
      <rect width="200" height="140" rx="16" fill="#fafaf9" />
      {/* 圆桌 */}
      <ellipse cx="100" cy="95" rx="60" ry="15" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" />
      {/* 对话气泡 */}
      <rect x="70" y="20" width="60" height="25" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <path d="M95 45l5 8 5-8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="80" y1="28" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="2" />
      <line x1="80" y1="34" x2="110" y2="34" stroke="#e2e8f0" strokeWidth="2" />
      {/* 6个小人围坐 - 简化版 */}
      {/* Kay */}
      <circle cx="55" cy="72" r="8" fill="#eef2ff" stroke="#a5b4fc" strokeWidth="1" />
      <circle cx="55" cy="70" r="4" fill="#fde8d0" />
      <rect x="53" y="69" width="1.5" height="1" rx="0.5" fill="#1e293b" />
      <rect x="56" y="69" width="1.5" height="1" rx="0.5" fill="#1e293b" />
      {/* Mia */}
      <circle cx="80" cy="65" r="8" fill="#ecfdf5" stroke="#6ee7b7" strokeWidth="1" />
      <circle cx="80" cy="63" r="4" fill="#fde8d0" />
      <path d="M77 63c0.5-1 1.5-1 2 0" stroke="#1e293b" strokeWidth="0.8" />
      <path d="M81 63c0.5-1 1.5-1 2 0" stroke="#1e293b" strokeWidth="0.8" />
      {/* Rex */}
      <circle cx="120" cy="65" r="8" fill="#fff7ed" stroke="#fdba74" strokeWidth="1" />
      <circle cx="120" cy="63" r="4" fill="#fde8d0" />
      <circle cx="118.5" cy="63" r="0.8" fill="#1e293b" />
      <circle cx="121.5" cy="63" r="0.8" fill="#1e293b" />
      {/* Vivi */}
      <circle cx="145" cy="72" r="8" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="1" />
      <circle cx="145" cy="70" r="4" fill="#fde8d0" />
      <path d="M143 70c0.5-1 1.5-1.2 2 0" stroke="#1e293b" strokeWidth="0.8" />
      <path d="M146 70c0.5-1 1.5-1.2 2 0" stroke="#1e293b" strokeWidth="0.8" />
      {/* Coco */}
      <circle cx="68" cy="85" r="8" fill="#fff1f2" stroke="#fda4af" strokeWidth="1" />
      <circle cx="68" cy="83" r="4" fill="#fde8d0" />
      <circle cx="66.5" cy="83" r="1" fill="#1e293b" />
      <circle cx="69.5" cy="83" r="1" fill="#1e293b" />
      {/* Lu */}
      <circle cx="132" cy="85" r="8" fill="#fffbeb" stroke="#fbbf24" strokeWidth="1" />
      <circle cx="132" cy="83" r="4" fill="#fde8d0" />
      <circle cx="130" cy="83" r="2.5" fill="none" stroke="#d4a017" strokeWidth="0.5" />
      <circle cx="134" cy="83" r="2.5" fill="none" stroke="#d4a017" strokeWidth="0.5" />
      {/* 文件 */}
      <rect x="90" y="80" width="8" height="10" rx="1" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
      <rect x="102" y="80" width="8" height="10" rx="1" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
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
