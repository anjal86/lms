'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { parseLeadCsv } from '@/lib/csv';
import { X, Upload, Check, AlertTriangle } from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const { addLead, showToast } = useApp();
  useDialog(isOpen, onClose);

  const SAMPLE_CSV = `Customer Name,Phone,Email,Destination,Budget,Dates,Adults\nTanvi Roy,+919811223344,tanvi@example.com,Bali,"$2,500",Oct 10-17,2\nMarkus Weber,+491701234567,m.weber@tech.de,Dubai,"$4,000",Nov 05-10,2`;

  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleImport = () => {
    const parsed = parseLeadCsv(csvText);
    setErrors(parsed.errors);
    if (parsed.leads.length === 0) {
      showToast('No valid lead rows found in CSV', 'error');
      return;
    }

    parsed.leads.forEach((lead) => addLead(lead));
    setImportedCount(parsed.leads.length);
    showToast(
      `Imported ${parsed.leads.length} lead${parsed.leads.length === 1 ? '' : 's'}${parsed.errors.length ? ` with ${parsed.errors.length} skipped row(s)` : ''}`,
      parsed.errors.length ? 'warning' : 'success'
    );
    setTimeout(onClose, 900);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div>
            <div id="csv-modal-title" className="text-xs font-semibold text-zinc-900">Bulk CSV Lead Importer</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Quoted commas and standard CSV escaping are supported</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="p-1 text-zinc-400 hover:text-zinc-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <textarea
            rows={8}
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            aria-label="CSV lead data"
            className="w-full font-mono text-[11px] border border-zinc-200 rounded p-2.5 bg-zinc-50 text-zinc-800 focus:bg-white resize-none leading-relaxed"
          />

          {errors.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              <div className="font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" />Skipped rows</div>
              {errors.slice(0, 8).map((error) => <div key={error}>{error}</div>)}
              {errors.length > 8 && <div>+{errors.length - 8} more</div>}
            </div>
          )}

          {importedCount !== null && (
            <div className="text-xs font-medium text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Imported {importedCount} leads
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button type="button" onClick={onClose} className="px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded transition">Cancel</button>
            <button type="button" onClick={handleImport} className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition">
              <Upload className="w-3.5 h-3.5" /> <span>Import Leads</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
