import type { ReactNode } from 'react';
import PageInboxSelector from '@/components/inbox/PageInboxSelector';
import styles from './inbox.module.css';
import headerStyles from './header-cleanup.module.css';
import listStyles from './list-cleanup.module.css';
import metaChatStyles from './meta-chat.module.css';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.scope} ${headerStyles.headerScope} ${listStyles.listScope} ${metaChatStyles.metaChatScope}`}
      style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}
    >
      <PageInboxSelector />
      <div className="min-h-0">{children}</div>
    </div>
  );
}
