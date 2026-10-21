'use client';

import { useRef, useState } from 'react';
import { Copy, Download, Eraser, FileText } from 'lucide-react';
import {
  EXAMPLE_REVIEW,
  EMPTY_REVIEW,
  REVIEW_FIELDS,
  buildReviewText,
  filledCount,
  hasInput,
  remainingLength,
  reviewFileName,
  type ReviewFields,
} from '@/lib/interview-review-template';
import styles from '@/components/public-guides/PublicGuide.module.css';
import { trackProductEvent } from '@/lib/product-events';

export default function InterviewReviewTemplate() {
  const [fields, setFields] = useState<ReviewFields>(EMPTY_REVIEW);
  const [example, setExample] = useState(false);
  const [pendingClear, setPendingClear] = useState(false);
  const [backup, setBackup] = useState<{ fields: ReviewFields; example: boolean; action: 'clear' | 'example' } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const started = useRef(false);

  const filled = filledCount(fields);
  const exportable = hasInput(fields);

  function setValue(key: keyof ReviewFields, value: string) {
    if (!started.current && value.trim()) {
      started.current = true;
      trackProductEvent('interview_template_started', { sample: example });
    }
    setFields((previous) => ({ ...previous, [key]: value }));
    setPendingClear(false);
    setBackup(null);
    setError('');
    setNotice('');
  }

  function loadExample() {
    if (REVIEW_FIELDS.every(({ key }) => fields[key] === EXAMPLE_REVIEW[key])) return;
    if (hasInput(fields)) setBackup({ fields, example, action: 'example' });
    setFields(EXAMPLE_REVIEW);
    setExample(true);
    setPendingClear(false);
    setError('');
    setNotice('已填入虚构示例；如覆盖了输入，可撤销替换。基于示例编辑和导出仍保留示例标记；填写自己的回答请先清空。');
    trackProductEvent('interview_template_sample_used');
  }

  function requestClear() {
    if (!exportable) {
      setError('当前没有已填写的内容，无需清空。');
      setNotice('');
      return;
    }
    if (!pendingClear) {
      setPendingClear(true);
      setError('');
      setNotice('点「确认清空」会清掉这四格，清空后本页仍可撤销一次。');
      return;
    }
    setBackup({ fields, example, action: 'clear' });
    setFields(EMPTY_REVIEW);
    setExample(false);
    setPendingClear(false);
    setError('');
    setNotice('已清空。需要找回刚才的内容可以点「撤销清空」。');
  }

  function undoClear() {
    if (!backup) return;
    setFields(backup.fields);
    setExample(backup.example);
    setBackup(null);
    setPendingClear(false);
    setError('');
    setNotice('已恢复操作前的内容与示例标记。');
  }

  function text() {
    return buildReviewText(fields, example);
  }

  function requireContent(): boolean {
    if (exportable) return true;
    setError('四格都还是空的。可以先载入虚构示例看格式，再换成你自己的回答。');
    setNotice('');
    return false;
  }

  async function copyAll() {
    if (!requireContent()) return;
    try {
      await navigator.clipboard.writeText(text());
      setNotice('已复制到剪贴板，粘贴到任意笔记里即可带走。');
      setError('');
      trackProductEvent('interview_template_copied', { sample: example });
    } catch {
      setError('浏览器没有允许复制。请改用「下载 .txt」。');
      setNotice('');
    }
  }

  function downloadAll() {
    if (!requireContent()) return;
    try {
      const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = reviewFileName(example);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
      setNotice('已下载纯文本 .txt 文件。这是文本导出，不是 PDF 排版。');
      trackProductEvent('interview_template_downloaded', { sample: example });
    } catch {
      setError('下载没有成功，请改用「复制全部」。');
      setNotice('');
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <button type="button" className={styles.ghost} onClick={loadExample}>
          <FileText size={16} aria-hidden="true" />
          载入虚构示例
        </button>
        <button type="button" className={styles.primary} onClick={copyAll}>
          <Copy size={16} aria-hidden="true" />
          复制全部
        </button>
        <button type="button" className={styles.ghost} onClick={downloadAll}>
          <Download size={16} aria-hidden="true" />
          下载 .txt
        </button>
        <button type="button" className={styles.ghost} onClick={requestClear}>
          <Eraser size={16} aria-hidden="true" />
          {pendingClear ? '确认清空' : '清空重写'}
        </button>
        {backup && (
          <button type="button" className={styles.undo} onClick={undoClear}>
            {backup.action === 'example' ? '撤销替换' : '撤销清空'}
          </button>
        )}
        <p>{`已填 ${filled} / 4 格 · 内容只在当前页面，离开前请复制或下载`}</p>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>

      <div className={styles.template}>
        {REVIEW_FIELDS.map(({ key, question, hint, placeholder, maxLength }, index) => (
          <div key={key} className={styles.field}>
            <label htmlFor={`review-${key}`}>
              {`${index + 1}. ${question}`}
              <span>{`剩 ${remainingLength(fields[key], maxLength)} 字`}</span>
            </label>
            <p className={styles.help}>{hint}</p>
            <textarea
              id={`review-${key}`}
              value={fields[key]}
              maxLength={maxLength}
              placeholder={placeholder}
              onChange={(event) => setValue(key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
