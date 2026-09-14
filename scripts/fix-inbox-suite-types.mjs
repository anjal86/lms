import fs from 'node:fs';

const path = 'src/components/inbox/StableInbox.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldProfile = "author_profile?: { full_name: string | null } | null;";
const newProfile = "author_profile?: { full_name?: string | null } | null;";
if (!src.includes(oldProfile)) throw new Error('Message author profile type target not found');
src = src.replace(oldProfile, newProfile);

const oldHandler = `  useEffect(() => {
    const onComposerError = (event) => showToast(event.detail || 'Composer action failed.', 'error');
    window.addEventListener('inbox-composer-error', onComposerError);
    return () => window.removeEventListener('inbox-composer-error', onComposerError);
  }, [showToast]);`;
const newHandler = `  useEffect(() => {
    const onComposerError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      showToast(detail || 'Composer action failed.', 'error');
    };
    window.addEventListener('inbox-composer-error', onComposerError);
    return () => window.removeEventListener('inbox-composer-error', onComposerError);
  }, [showToast]);`;
if (!src.includes(oldHandler)) throw new Error('Composer error handler target not found');
src = src.replace(oldHandler, newHandler);

fs.writeFileSync(path, src);
