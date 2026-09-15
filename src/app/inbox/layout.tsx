import type { ReactNode } from 'react';
import styles from './inbox.module.css';
import headerStyles from './header-cleanup.module.css';
import listStyles from './list-cleanup.module.css';
import metaChatStyles from './meta-chat.module.css';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.scope} ${headerStyles.headerScope} ${listStyles.listScope} ${metaChatStyles.metaChatScope}`}
    >
      {children}
    </div>
  );
}
