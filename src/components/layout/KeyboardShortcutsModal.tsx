'use client';

import React from 'react';
import { useDialog } from '@/lib/useDialog';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  useDialog({ isOpen, onClose });
  const { currentUser } = useApp();
  const { term, moduleEnabled } = useWorkspace();

  if (!isOpen) return null;

  const isAgent = currentUser.role === 'agent';
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadLabel = term('lead', 'Lead');
  const leadPlural = term('lead_plural', 'Leads');

  const navigationItems = [
    ...(leadsEnabled ? [{ keys: ['G', 'L'], desc: isAgent ? `Go to My ${leadPlural}` : `Go to ${leadPlural}` }] : []),
    ...(tasksEnabled ? [{ keys: ['G', 'F'], desc: 'Go to Follow-Up Agenda' }] : []),
    ...(canManage ? [{ keys: ['G', 'T'], desc: 'Go to Team Directory' }] : []),
  ];

  const shortcutGroups = [
    {
      title: 'Global Navigation',
      items: [
        { keys: ['⌘', 'K'], desc: 'Open Command Palette / Search' },
        { keys: ['?'], desc: 'Show Keyboard Shortcuts Cheat Sheet' },
        { keys: ['Esc'], desc: 'Dismiss open modal, drawer, or menu' },
      ],
    },
    ...(navigationItems.length > 0 ? [{ title: 'Quick Page Navigation (Press G then...)', items: navigationItems }] : []),
    {
      title: 'Actions & Ergonomics',
      items: [
        ...(leadsEnabled ? [{ keys: ['N'], desc: `Quick Open New ${leadLabel}` }] : []),
        { keys: ['Tab'], desc: 'Navigate between fields / buttons' },
        { keys: ['Enter'], desc: 'Submit dialog / Confirm action' },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-100">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-zinc-700" />
            <h2 id="shortcuts-modal-title" className="text-xs font-semibold text-zinc-900 tracking-tight">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="p-1 text-zinc-400 hover:text-zinc-700 rounded transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-zinc-50 transition"
                  >
                    <span className="text-zinc-600 text-[11px]">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-100 font-mono text-[10px] text-zinc-700 font-medium shadow-2xs min-w-[20px] text-center inline-block"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Press <kbd className="font-mono text-[10px] px-1 rounded bg-zinc-200 text-zinc-700">?</kbd> anytime to open</span>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded bg-zinc-900 text-white text-[11px] font-medium hover:bg-zinc-800 transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
