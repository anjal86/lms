'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { WhatsAppTemplate } from '@/lib/types';
import {
  MessageSquareQuote,
  Plus,
  Trash2,
  Check,
  Copy,
} from 'lucide-react';

export default function TemplatesPage() {
  const { templates, updateTemplates, currentUser } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'welcome' | 'quote_followup' | 'discount' | 'reminder'>('welcome');
  const [newBody, setNewBody] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAddTemplate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !newTitle.trim() || !newBody.trim()) return;

    const newTemplate: WhatsAppTemplate = {
      id: `tpl-${Date.now()}`,
      name: newTitle.trim(),
      category: newCategory,
      message_body: newBody.trim(),
      is_active: true,
      created_at: new Date().toISOString(),
    };

    updateTemplates([...templates, newTemplate]);
    setIsAdding(false);
    setNewTitle('');
    setNewBody('');
  };

  const handleDelete = (id: string) => {
    if (!canManage) return;
    updateTemplates(templates.filter((template) => template.id !== id));
  };

  const insertVariable = (variable: string) => setNewBody((value) => value + variable);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const categoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      welcome: 'Welcome',
      quote_followup: 'Quote follow-up',
      discount: 'Offer',
      reminder: 'Reminder',
      custom: 'Message',
    };
    return labels[category] || 'Message';
  };

  return (
    <div className="workspace-page max-w-5xl">
      <div className="workspace-header">
        <div>
          <p className="workspace-eyebrow">Messages</p>
          <h1 className="workspace-title">Saved messages</h1>
          <p className="workspace-description">
            {canManage
              ? 'Keep useful customer messages ready for the whole team.'
              : 'Copy a message, personalize it for the traveler, and send it.'}
          </p>
        </div>

        {canManage && (
          <button type="button" onClick={() => setIsAdding((value) => !value)} className="button-primary">
            <Plus className="h-4 w-4" /> Add message
          </button>
        )}
      </div>

      {canManage && isAdding && (
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Add a saved message</h2>
              <p className="mt-1 text-xs text-zinc-500">Use the placeholders only where you want traveler details filled automatically.</p>
            </div>
            <button type="button" onClick={() => setIsAdding(false)} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">Cancel</button>
          </div>

          <form onSubmit={handleAddTemplate} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="message-title" className="mb-1.5 block text-xs font-medium text-zinc-700">Name</label>
                <input id="message-title" type="text" required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Example: First reply" className="field" />
              </div>
              <div>
                <label htmlFor="message-category" className="mb-1.5 block text-xs font-medium text-zinc-700">Type</label>
                <select id="message-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value as typeof newCategory)} className="field">
                  <option value="welcome">Welcome</option>
                  <option value="quote_followup">Quote follow-up</option>
                  <option value="discount">Offer</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="message-body" className="mb-1.5 block text-xs font-medium text-zinc-700">Message</label>
              <textarea id="message-body" rows={5} required value={newBody} onChange={(event) => setNewBody(event.target.value)} placeholder="Hi {{customer_name}}, I’m following up about your {{destination}} trip…" className="field resize-none leading-6" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">Add:</span>
                {[
                  ['Traveler name', '{{customer_name}}'],
                  ['Destination', '{{destination}}'],
                  ['Agent name', '{{agent_name}}'],
                ].map(([label, value]) => (
                  <button key={value} type="button" onClick={() => insertVariable(value)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">{label}</button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="button-secondary">Cancel</button>
              <button type="submit" className="button-primary">Save message</button>
            </div>
          </form>
        </section>
      )}

      {templates.length === 0 ? (
        <section className="panel px-6 py-14 text-center">
          <MessageSquareQuote className="mx-auto h-6 w-6 text-zinc-300" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">No saved messages yet</h2>
          <p className="mt-1 text-xs text-zinc-500">{canManage ? 'Add a message the team can reuse.' : 'Ask a manager to add shared messages.'}</p>
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.filter((template) => template.is_active).map((template) => (
            <article key={template.id} className="panel flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{categoryLabel(template.category)}</span>
                  <h2 className="mt-3 text-sm font-semibold text-zinc-950">{template.name}</h2>
                </div>
                {canManage && (
                  <button type="button" onClick={() => handleDelete(template.id)} aria-label={`Delete ${template.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex-1 rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
                <div className="whitespace-pre-wrap">{template.message_body}</div>
              </div>

              <button type="button" onClick={() => void handleCopy(template.message_body, template.id)} className="button-secondary mt-3 w-full">
                {copiedId === template.id ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy message</>}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
