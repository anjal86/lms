'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, Upload, Check } from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const { addLead, showToast } = useApp();
  useDialog(isOpen, onClose);

  const SAMPLE_CSV = `Customer Name,Phone,Email,Destination,Budget,Dates,Adults
Tanvi Roy,+919811223344,tanvi@example.com,Bali,$2500,Oct 10-17,2
Markus Weber,+491701234567,m.weber@tech.de,Dubai,$4000,Nov 05-10,2
Elena Rostova,+79031234567,elena.r@mail.ru,Maldives,$6000,Dec 15-22,2`;

  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleImport = () => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return;

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 2) {
        addLead({
          customer_name: parts[0] || 'Imported Lead',
          customer_phone: parts[1] || '',
          customer_email: parts[2] || '',
          destination: parts[3] || 'Bali',
          budget_range: parts[4] || '$2,000 - $3,000',
          travel_dates: parts[5] || 'Flexible dates',
          pax_adults: parts[6] ? parseInt(parts[6], 10) : 2,
          source: 'csv_import',
          stage: 'new',
        });
        count++;
      }
    }

    setImportedCount(count);
    showToast(`Successfully imported ${count} leads into pipeline`, 'success');
    setTimeout(() => onClose(), 1000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div>
            <div id="csv-modal-title" className="text-xs font-semibold text-zinc-900">Bulk CSV Lead Importer</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Auto-routes to agents matching destination tags</div>
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
          <textarea
            rows={7}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            aria-label="CSV lead data"
            className="w-full font-mono text-[11px] border border-zinc-200 rounded p-2.5 bg-zinc-50 text-zinc-800 focus:bg-white resize-none leading-relaxed"
          />

          {importedCount !== null && (
            <div className="text-xs font-medium text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Imported {importedCount} leads successfully
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Leads</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
