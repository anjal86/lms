'use client';

import React from 'react';
import { useApp } from '@/lib/store';
import { CheckCircle2, Sparkles, AlertTriangle, AlertCircle, X } from 'lucide-react';

export default function ToastContainer() {
  const { toast, hideToast } = useApp();

  if (!toast) return null;

  const renderIcon = () => {
    switch (toast.type) {
      case 'info':
        return <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case 'success':
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-xl rounded-md text-xs animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-sm"
    >
      {renderIcon()}
      <span className="font-medium flex-1 text-zinc-200 leading-tight select-none">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={hideToast}
        aria-label="Dismiss notification"
        className="p-1 text-zinc-400 hover:text-zinc-200 rounded transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
