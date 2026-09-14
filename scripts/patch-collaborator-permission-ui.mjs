import fs from 'node:fs';

const path = 'src/components/inbox/StableInbox.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldAddRemove = `  const addCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id || !userId) return;
    const response = await fetch(\`/api/conversations/\${id}/collaborators\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
    if (response.ok) { secondaryCache.current.delete(id); await loadSecondary(id, true); }
  };

  const removeCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    await fetch(\`/api/conversations/\${id}/collaborators?userId=\${encodeURIComponent(userId)}\`, { method: 'DELETE' });
    secondaryCache.current.delete(id);
    await loadSecondary(id, true);
  };`;

const newAddRemove = `  const addCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id || !userId) return;
    const response = await fetch(\`/api/conversations/\${id}/collaborators\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      showToast(payload.error || 'Unable to add collaborator.', 'error');
      return;
    }
    secondaryCache.current.delete(id);
    await loadSecondary(id, true);
  };

  const removeCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const response = await fetch(\`/api/conversations/\${id}/collaborators?userId=\${encodeURIComponent(userId)}\`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      showToast(payload.error || 'Unable to remove collaborator.', 'error');
      return;
    }
    secondaryCache.current.delete(id);
    await loadSecondary(id, true);
  };`;

if (!src.includes(oldAddRemove)) throw new Error('add/remove collaborator block not found');
src = src.replace(oldAddRemove, newAddRemove);

const oldAvailable = `  const availableCollaborators = allProfiles.filter((profile) => profile.is_active && !collaborators.some((row) => row.user_id === profile.id));`;
const newAvailable = `  const canManageCollaborators = can('inbox.assign');
  const availableCollaborators = allProfiles.filter((profile) =>
    profile.is_active
    && !collaborators.some((row) => row.user_id === profile.id)
    && (canManageCollaborators || profile.id === currentUser?.id)
  );`;
if (!src.includes(oldAvailable)) throw new Error('available collaborators line not found');
src = src.replace(oldAvailable, newAvailable);

const oldSection = `<section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Collaborators</div><div className="mt-2 flex flex-wrap gap-1.5">{collaborators.map((item) => <button key={item.user_id} type="button" onClick={() => void removeCollaborator(item.user_id)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold">{item.user?.full_name || 'Member'} ×</button>)}</div><select defaultValue="" onChange={(e) => { const value = e.target.value; e.target.value = ''; if (value) void addCollaborator(value); }} className="select-field mt-2 h-8 w-full text-xs"><option value="">Add collaborator…</option>{availableCollaborators.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></section>`;
const newSection = `<section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Collaborators</div><div className="mt-2 flex flex-wrap gap-1.5">{collaborators.map((item) => { const removable = canManageCollaborators || item.user_id === currentUser?.id; return removable ? <button key={item.user_id} type="button" onClick={() => void removeCollaborator(item.user_id)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold">{item.user?.full_name || 'Member'} ×</button> : <span key={item.user_id} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">{item.user?.full_name || 'Member'}</span>; })}</div>{availableCollaborators.length > 0 && <select defaultValue="" onChange={(e) => { const value = e.target.value; e.target.value = ''; if (value) void addCollaborator(value); }} className="select-field mt-2 h-8 w-full text-xs"><option value="">Add collaborator…</option>{availableCollaborators.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}</section>`;
if (!src.includes(oldSection)) throw new Error('collaborator section not found');
src = src.replace(oldSection, newSection);

fs.writeFileSync(path, src);
