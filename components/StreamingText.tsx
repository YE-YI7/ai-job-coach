"use client";

import { useState, useEffect } from "react";
import { parseMarkdownBold } from "@/lib/markdown-utils";

interface StreamingTextProps {
  text: string;
  speed?: number; // 每个字符的延迟时间（毫秒）
  onComplete?: () => void;
  className?: string;
}

export default function StreamingText({ 
  text, 
  speed = 30, 
  onComplete,
  className = "" 
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timer);
    } else if (currentIndex === text.length && !isComplete) {
      setIsComplete(true);
      if (onComplete) {
        onComplete();
      }
    }
  }, [currentIndex, text, speed, onComplete, isComplete]);

  return (
    <span className={className}>
      {parseMarkdownBold(displayedText)}
      {!isComplete && (
        <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse">
          |
        </span>
      )}
    </span>
  );
}
