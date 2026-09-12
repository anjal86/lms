'use client';

import React, { useState } from 'react';
import { Lead } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, Send, MessageSquare, Copy } from 'lucide-react';

interface WhatsAppModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

export default function WhatsAppModal({ lead, isOpen, onClose }: WhatsAppModalProps) {
  const { templates, currentUser, logActivity, showToast } = useApp();
  useDialog(isOpen, onClose);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || ''
  );

  const fillTemplate = (templateBody: string) => {
    return templateBody
      .replace(/\{\{customer_name\}\}/g, lead.customer_name)
      .replace(/\{\{destination\}\}/g, lead.destination)
      .replace(/\{\{agent_name\}\}/g, currentUser.full_name)
      .replace(
        /\{\{pax_count\}\}/g,
        `${lead.pax_adults} Adults${lead.pax_children ? `, ${lead.pax_children} Children` : ''}`
      );
  };

  const initialBody = templates[0] ? fillTemplate(templates[0].message_body) : '';
  const [messageText, setMessageText] = useState(initialBody);

  if (!isOpen) return null;

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setMessageText(fillTemplate(tpl.message_body));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    showToast('Copied proposal text to clipboard', 'success');
  };

  const handleSend = () => {
    const cleanPhone = lead.customer_phone.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(messageText);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');

    logActivity({
      leadId: lead.id,
      type: 'whatsapp',
      title: 'WhatsApp Proposal Sent',
      outcome: 'Quote Sent',
      notes: `Sent: "${messageText.slice(0, 100)}..."`,
    });

    showToast('Opened WhatsApp and logged activity', 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span id="whatsapp-modal-title" className="text-xs font-semibold text-zinc-900">
              WhatsApp Proposal
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
              Select Preset
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800 focus:outline-none"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
              Message Preview
            </label>
            <textarea
              rows={5}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded p-2.5 bg-zinc-50/50 text-zinc-800 focus:bg-white focus:outline-none resize-none leading-relaxed font-sans"
            />
          </div>

          <div className="text-[11px] text-zinc-500 bg-zinc-50 p-2 rounded border border-zinc-200">
            Recipient: <span className="font-mono text-zinc-800 font-medium">{lead.customer_phone}</span> ({lead.customer_name})
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200 rounded transition cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>Copy Text</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition"
              >
                <Send className="w-3 h-3" />
                <span>Dispatch on WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
