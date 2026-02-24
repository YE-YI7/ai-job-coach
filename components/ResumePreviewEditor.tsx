"use client";

import React, { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";

// ========== 头像上传约束 ==========
const AVATAR_MAX_SIZE = 500 * 1024; // 500KB
const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_WIDTH = 120;
const AVATAR_MAX_HEIGHT = 150;

// ========== 类型定义 ==========
type ResumePreview = {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
};

type AvatarData = {
  src: string;
  x: number; // percent from left
  y: number; // percent from top
  width: number;
  height: number;
} | null;

interface ResumePreviewEditorProps {
  preview: ResumePreview;
  onPreviewChange?: (preview: ResumePreview) => void;
  avatarData: AvatarData;
  onAvatarChange?: (data: AvatarData) => void;
}

// ========== 工具栏按钮 ==========
function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

// ========== 颜色选择器 ==========
const PRESET_COLORS = [
  "#000000", "#374151", "#DC2626", "#EA580C",
  "#CA8A04", "#16A34A", "#2563EB", "#7C3AED",
];

function ColorPicker({
  currentColor,
  onChange,
}: {
  currentColor: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="文字颜色"
        className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1"
      >
        <span>A</span>
        <span
          className="w-3 h-3 rounded-sm border border-gray-300"
          style={{ backgroundColor: currentColor || "#000000" }}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 grid grid-cols-4 gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="w-6 h-6 rounded-sm border border-gray-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ========== 高亮选择器 ==========
const HIGHLIGHT_COLORS = [
  "#FEF08A", "#BBF7D0", "#BFDBFE", "#E9D5FF",
  "#FECDD3", "#FED7AA",
];

function HighlightPicker({
  onChange,
}: {
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="高亮"
        className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
      >
        <span className="bg-yellow-200 px-0.5">H</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 grid grid-cols-3 gap-1">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="w-6 h-6 rounded-sm border border-gray-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="w-6 h-6 rounded-sm border border-gray-200 hover:scale-110 transition-transform text-[10px] text-gray-500"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ========== 简历预览编辑器主体 ==========
function previewToHTML(preview: ResumePreview): string {
  const sections: { title: string; content: string }[] = [];
  if (preview.personalInfo)
    sections.push({ title: "个人信息", content: preview.personalInfo });
  if (preview.education)
    sections.push({ title: "教育信息", content: preview.education });
  if (preview.campusExperience)
    sections.push({ title: "在校经历", content: preview.campusExperience });
  if (preview.projects)
    sections.push({ title: "项目经历", content: preview.projects });
  if (preview.workExperience)
    sections.push({ title: "工作/实习经历", content: preview.workExperience });
  if (preview.selfEvaluation)
    sections.push({ title: "个人评价", content: preview.selfEvaluation });

  if (sections.length === 0) {
    return '<p style="color:#9ca3af;text-align:center;">预览区域为空，请在左侧分区点击"应用"按钮填充内容</p>';
  }

  return sections
    .map(
      (s) =>
        `<h3>${s.title}</h3>` +
        s.content
          .split("\n")
          .map((line) => `<p>${line || "&nbsp;"}</p>`)
          .join("")
    )
    .join("");
}

export default function ResumePreviewEditor({
  preview,
  onPreviewChange,
  avatarData,
  onAvatarChange,
}: ResumePreviewEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Tiptap 编辑器
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: previewToHTML(preview),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-1 py-2 text-gray-700",
      },
    },
    // 不自动同步回preview，只在用户需要时同步
  });

  // 当 preview 数据从外部更新时，同步到编辑器
  // 使用 ref 来追踪前一次preview
  const prevPreviewRef = useRef(preview);
  React.useEffect(() => {
    if (!editor) return;
    const prevStr = JSON.stringify(prevPreviewRef.current);
    const curStr = JSON.stringify(preview);
    if (prevStr !== curStr) {
      // 外部更新了preview，同步到编辑器
      const newHTML = previewToHTML(preview);
      // 只在内容确实不同时才更新，避免光标跳动
      if (editor.getHTML() !== newHTML) {
        editor.commands.setContent(newHTML);
      }
      prevPreviewRef.current = preview;
    }
  }, [preview, editor]);

  // ========== 头像上传处理 ==========
  const handleAvatarUpload = useCallback(
    (file: File) => {
      setUploadError(null);

      if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
        setUploadError("仅支持 JPG/PNG/WebP 格式");
        return;
      }
      if (file.size > AVATAR_MAX_SIZE) {
        setUploadError("图片大小不能超过 500KB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        // 检查图片尺寸
        const img = new window.Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          // 缩放到限制范围内
          if (w > AVATAR_MAX_WIDTH || h > AVATAR_MAX_HEIGHT) {
            const ratio = Math.min(
              AVATAR_MAX_WIDTH / w,
              AVATAR_MAX_HEIGHT / h
            );
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          onAvatarChange?.({
            src,
            x: 85, // 默认放右上角
            y: 2,
            width: w,
            height: h,
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [onAvatarChange]
  );

  // 拖拽上传头像
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleAvatarUpload(file);
      }
    },
    [handleAvatarUpload]
  );

  // 拖拽头像位置
  const handleAvatarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!avatarData || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const avatarX = (avatarData.x / 100) * rect.width;
      const avatarY = (avatarData.y / 100) * rect.height;
      setDragOffset({
        x: e.clientX - rect.left - avatarX,
        y: e.clientY - rect.top - avatarY,
      });
      setDragging(true);
    },
    [avatarData]
  );

  React.useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !avatarData) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
      const newY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
      onAvatarChange?.({
        ...avatarData,
        x: Math.max(0, Math.min(90, newX)),
        y: Math.max(0, Math.min(90, newY)),
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dragOffset, avatarData, onAvatarChange]);

  if (!editor) return null;

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg sticky top-0 z-10">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗"
        >
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        >
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        >
          <s>S</s>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ColorPicker
          currentColor={
            (editor.getAttributes("textStyle").color as string) || "#000000"
          }
          onChange={(color) => editor.chain().focus().setColor(color).run()}
        />
        <HighlightPicker
          onChange={(color) => {
            if (color) {
              editor.chain().focus().toggleHighlight({ color }).run();
            } else {
              editor.chain().focus().unsetHighlight().run();
            }
          }}
        />

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="左对齐"
        >
          &#8676;
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="居中"
        >
          &#8596;
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="右对齐"
        >
          &#8677;
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          1. List
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* 头像上传按钮 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="上传头像"
          className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1"
        >
          <span>📷</span>
          <span>头像</span>
        </button>

        {avatarData && (
          <button
            type="button"
            onClick={() => onAvatarChange?.(null)}
            title="删除头像"
            className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            ✕ 移除
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAvatarUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* 上传错误提示 */}
      {uploadError && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-sm">
          <span className="text-red-700">{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="text-red-600 hover:text-red-800 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 编辑器 + 头像叠加区域 */}
      <div
        ref={containerRef}
        className="relative bg-white border border-gray-200 rounded-lg p-6 min-h-[500px]"
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* 拖拽提示覆层 */}
        <div
          className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-transparent z-20 transition-colors"
          style={{
            borderColor: "transparent",
          }}
        />

        {/* 头像 */}
        {avatarData && (
          <div
            style={{
              position: "absolute",
              left: `${avatarData.x}%`,
              top: `${avatarData.y}%`,
              width: avatarData.width,
              height: avatarData.height,
              zIndex: 15,
              cursor: dragging ? "grabbing" : "grab",
            }}
            onMouseDown={handleAvatarMouseDown}
            className="select-none rounded-md shadow-md border-2 border-white ring-1 ring-gray-200 hover:ring-blue-400 transition-all"
          >
            <img
              src={avatarData.src}
              alt="头像"
              className="w-full h-full object-cover rounded-md"
              draggable={false}
            />
            {/* 拖拽提示 */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity">
              拖拽移动位置
            </div>
          </div>
        )}

        {/* Tiptap 编辑器内容 */}
        <EditorContent editor={editor} />
      </div>

      {/* 拖拽上传提示 */}
      <p className="text-xs text-gray-400 text-center">
        提示：可直接拖拽图片到预览区上传头像，或点击工具栏📷按钮
      </p>
    </div>
  );
}
