import type { ReactNode } from 'react';
import styles from './inbox.module.css';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return <div className={styles.scope}>{children}</div>;
}
