import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import styles from './PublicGuide.module.css';

export default function PublicGuideFooter({ note }: { note: string }) {
  return (
    <footer className={styles.footer}>
      <span>{note}</span>
      <Link href="/">
        回到益职 AI
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </footer>
  );
}
