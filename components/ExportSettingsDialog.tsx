'use client';

import { useState, useEffect } from 'react';
import { getAllTemplates, ResumeTemplate } from '@/lib/resume-templates';

interface ExportSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (templateId: string, includePhoto: boolean) => void;
  hasAvatar?: boolean; // 是否已上传头像
}

export default function ExportSettingsDialog({
  isOpen,
  onClose,
  onExport,
  hasAvatar = false,
}: ExportSettingsDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('technical');
  const [includePhoto, setIncludePhoto] = useState<boolean>(false);
  const [templates] = useState<ResumeTemplate[]>(getAllTemplates());

  // Load saved preferences, auto-enable photo if avatar exists
  useEffect(() => {
    if (isOpen) {
      const savedTemplate = localStorage.getItem('resume-export-template');
      const savedPhotoPreference = localStorage.getItem('resume-export-photo');
      
      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate);
      }
      if (hasAvatar) {
        setIncludePhoto(true);
      } else if (savedPhotoPreference) {
        setIncludePhoto(savedPhotoPreference === 'true');
      }
    }
  }, [isOpen, hasAvatar]);

  const handleExport = () => {
    // Save preferences
    localStorage.setItem('resume-export-template', selectedTemplateId);
    localStorage.setItem('resume-export-photo', String(includePhoto));
    
    onExport(selectedTemplateId, includePhoto);
  };

  if (!isOpen) return null;

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">导出设置</h2>
          <p className="text-sm text-gray-500 mt-1">选择模板和导出选项</p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择模板
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          {/* Photo Option */}
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePhoto}
                onChange={(e) => setIncludePhoto(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                {hasAvatar ? '包含头像照片' : '包含照片占位符'}
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              {hasAvatar 
                ? '✓ 已上传头像，将自动嵌入到简历右上角'
                : '在简历右上角预留照片区域（可在编辑器中上传头像）'}
            </p>
          </div>

          {/* Template Preview */}
          <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
            <p className="text-xs font-medium text-gray-700 mb-2">模板预览</p>
            <div className="bg-white border border-gray-300 rounded p-2 text-xs text-gray-600">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1">姓名</div>
                  <div className="text-xs text-gray-500">联系方式</div>
                </div>
                {includePhoto && (
                  <div className="w-12 h-16 border border-dashed border-gray-400 flex items-center justify-center text-xs text-gray-400">
                    照片
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="font-medium text-xs">工作经历</div>
                <div className="text-xs text-gray-500">• 经历描述...</div>
                <div className="font-medium text-xs mt-2">教育背景</div>
                <div className="text-xs text-gray-500">• 学校信息...</div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-xs text-blue-800">
              💡 导出时会自动检测页数，如超过1页将自动压缩内容
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            导出PDF
          </button>
        </div>
      </div>
    </div>
  );
}
