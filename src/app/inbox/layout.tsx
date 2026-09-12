import type { ReactNode } from 'react';
import styles from './inbox.module.css';
import headerStyles from './header-cleanup.module.css';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return <div className={`${styles.scope} ${headerStyles.headerScope}`}>{children}</div>;
}
