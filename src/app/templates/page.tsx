'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { WhatsAppTemplate } from '@/lib/types';
import {
  MessageSquareQuote,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  MessageSquare,
  Copy,
} from 'lucide-react';

export default function TemplatesPage() {
  const { templates, updateTemplates } = useApp();

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'welcome' | 'quote_followup' | 'discount' | 'reminder'>('welcome');
  const [newBody, setNewBody] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newBody) return;

    const newTpl: WhatsAppTemplate = {
      id: `tpl-${Date.now()}`,
      name: newTitle,
      category: newCategory,
      message_body: newBody,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    updateTemplates([...templates, newTpl]);
    setIsAdding(false);
    setNewTitle('');
    setNewBody('');
  };

  const handleDelete = (id: string) => {
    updateTemplates(templates.filter((t) => t.id !== id));
  };

  const insertVariable = (variable: string) => {
    setNewBody((prev) => prev + variable);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <MessageSquareQuote className="w-4 h-4 text-zinc-500" />
            1-Click WhatsApp Quick Replies & Templates
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure dynamic messages sent to customers via 1-click <code>wa.me</code> shortcuts
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Template</span>
        </button>
      </div>

      {/* Add Template Card */}
      {isAdding && (
        <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs animate-in fade-in zoom-in-95 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
            <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">Create WhatsApp Template</h2>
            <button
              onClick={() => setIsAdding(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleAddTemplate} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                  Template Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flash Sale / Flight Fare Drop"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 focus:outline-none"
                >
                  <option value="welcome">Initial Welcome</option>
                  <option value="quote_followup">Quote & Itinerary Follow-Up</option>
                  <option value="discount">Urgent Discount / Price Drop</option>
                  <option value="reminder">Documentation & Visa Check</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-zinc-600">
                  Message Body with Dynamic Tags
                </label>
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span className="text-zinc-400">Insert:</span>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{customer_name}}')}
                    className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-200"
                  >
                    {'{{customer_name}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{destination}}')}
                    className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-200"
                  >
                    {'{{destination}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{agent_name}}')}
                    className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-200"
                  >
                    {'{{agent_name}}'}
                  </button>
                </div>
              </div>
              <textarea
                rows={4}
                required
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Hi {{customer_name}}, I have an exciting update regarding your {{destination}} trip..."
                className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-md p-2.5 text-zinc-900 focus:outline-none resize-none font-sans leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs"
              >
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white rounded-lg p-3.5 border border-zinc-200 shadow-2xs flex flex-col justify-between space-y-3 hover:border-zinc-300 transition"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-medium tracking-tight px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                  {tpl.category.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-1 text-zinc-400">
                  <button
                    type="button"
                    onClick={() => handleCopy(tpl.message_body, tpl.id)}
                    aria-label={`Copy template text for ${tpl.name}`}
                    title="Copy Text"
                    className="p-1 hover:text-zinc-700 hover:bg-zinc-100 rounded transition min-h-[30px] min-w-[30px] inline-flex items-center justify-center"
                  >
                    {copiedId === tpl.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl.id)}
                    aria-label={`Delete template ${tpl.name}`}
                    title="Delete Template"
                    className="p-1 hover:text-red-600 hover:bg-red-50 rounded transition min-h-[30px] min-w-[30px] inline-flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-xs font-semibold text-zinc-900 mb-2">{tpl.name}</h3>

              {/* Chat Bubble simulation */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-md p-2.5 text-xs text-zinc-700 leading-relaxed font-sans relative">
                <div className="whitespace-pre-wrap">{tpl.message_body}</div>
              </div>
            </div>

            <div className="text-[10px] text-zinc-400 pt-2 border-t border-zinc-100 flex items-center justify-between font-mono">
              <span>Ready for 1-click wa.me dispatch</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
