import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import styles from './PublicGuide.module.css';

export default function PublicGuideNav({ aside }: { aside: { href: string; label: string } }) {
  return (
    <nav className={styles.navigation} aria-label="页面导航">
      <Link href="/">
        <ArrowLeft size={16} aria-hidden="true" />
        益职AI 首页
      </Link>
      <Link href={aside.href}>
        {aside.label}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </nav>
  );
}
