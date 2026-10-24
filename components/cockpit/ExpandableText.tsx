"use client";

import { useId, useState } from "react";
import styles from "./ExpandableText.module.css";

/** 只折叠显示，不改写、摘要或保存用户的原材料。 */
export default function ExpandableText({
  text,
  previewLength = 180,
  label = "全文",
}: {
  text: string;
  previewLength?: number;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const characters = Array.from(text);
  const long = characters.length > previewLength;
  return (
    <div className={styles.copy}>
      <p id={id}>
        {long && !expanded
          ? `${characters.slice(0, previewLength).join("")}…`
          : text}
      </p>
      {long && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : `展开${label}`}
        </button>
      )}
    </div>
  );
}
