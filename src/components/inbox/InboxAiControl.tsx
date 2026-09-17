'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Clipboard, Loader2, PauseCircle, RotateCcw, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';

type AiState = {
  conversation_id: string;
  agent_id: string | null;
  state: 'active' | 'paused' | 'handed_off' | 'failed' | 'disabled';
  draft_reply?: string | null;
  last_ai_at?: string | null;
  handoff_reason?: string | null;
  last_error?: string | null;
  agent?: { id: string; name: string; model: string; mode: string; is_active: boolean } | Array<{ id: string; name: string; model: string; mode: string; is_active: boolean }> | null;
};

function agentOf(state: AiState | null) {
  if (!state?.agent) return null;
  return Array.isArray(state.agent) ? state.agent[0] || null : state.agent;
}

function statusLabel(state: AiState) {
  if (state.state === 'active' && state.draft_reply) return 'Draft ready';
  if (state.state === 'active') return 'AI active';
  if (state.state === 'paused') return 'AI paused';
  if (state.state === 'handed_off') return 'Human handoff';
  if (state.state === 'failed') return 'AI needs attention';
  return 'AI disabled';
}

export default function InboxAiControl() {
  const params = useSearchParams();
  const conversationId = params.get('conversationId') || params.get('id') || params.get('conversation');
  const { currentUser, showToast } = useApp();
  const canResume = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [state, setState] = useState<AiState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!conversationId) { setState(null); return; }
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/ai`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load AI state.');
      setState(payload.ai || null);
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : 'Unable to load AI state.', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [conversationId, showToast]);

  useEffect(() => {
    void load();
    const refresh = () => void load(true);
    window.addEventListener('crm:data-mutated', refresh);
    return () => window.removeEventListener('crm:data-mutated', refresh);
  }, [load]);

  const agent = useMemo(() => agentOf(state), [state]);

  const act = async (action: 'pause' | 'takeover' | 'resume') => {
    if (!conversationId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update AI state.');
      setState(payload.ai || null);
      showToast(action === 'resume' ? 'Conversation returned to AI.' : action === 'takeover' ? 'You took over this conversation.' : 'AI paused.', 'success');
      window.dispatchEvent(new CustomEvent('crm:data-mutated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update AI state.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (!state?.draft_reply) return;
    await navigator.clipboard.writeText(state.draft_reply);
    showToast('AI draft copied.', 'success');
  };

  if (!conversationId || (!state && !loading)) return null;

  if (loading && !state) {
    return <div className="fixed bottom-4 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-500 shadow-lg lg:flex"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking AI…</div>;
  }
  if (!state) return null;

  const active = state.state === 'active';
  const attention = state.state === 'failed' || state.state === 'handed_off';

  return <div className="fixed bottom-4 left-1/2 z-40 w-[min(94vw,620px)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-xl backdrop-blur">
    <div className="flex flex-wrap items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-blue-50 text-blue-700' : attention ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}><Bot className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-xs font-semibold text-zinc-950">{agent?.name || 'Workspace AI agent'}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${active ? 'bg-blue-50 text-blue-700' : attention ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-600'}`}>{statusLabel(state)}</span></div><p className="mt-0.5 truncate text-[10px] text-zinc-500">{state.handoff_reason || state.last_error || (agent?.mode === 'assist' ? 'Assist mode · staff sends the final reply' : 'AI can respond on this conversation')}</p></div>
      <div className="flex items-center gap-1.5">
        {state.draft_reply && <button type="button" onClick={() => void copyDraft()} className="button-secondary button-sm min-h-9"><Clipboard className="h-3.5 w-3.5" /> Copy draft</button>}
        {active ? <><button type="button" onClick={() => void act('pause')} disabled={busy} className="button-secondary button-sm min-h-9"><PauseCircle className="h-3.5 w-3.5" /> Pause</button><button type="button" onClick={() => void act('takeover')} disabled={busy} className="button-primary button-sm min-h-9"><UserRound className="h-3.5 w-3.5" /> Take over</button></> : canResume ? <button type="button" onClick={() => void act('resume')} disabled={busy} className="button-primary button-sm min-h-9">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Return to AI</button> : null}
      </div>
    </div>
  </div>;
}
