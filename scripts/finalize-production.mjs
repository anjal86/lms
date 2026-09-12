import fs from 'node:fs';

function replaceOnce(path, oldText, newText) {
  const text = fs.readFileSync(path, 'utf8');
  const first = text.indexOf(oldText);
  const last = text.lastIndexOf(oldText);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one guarded match`);
  }
  fs.writeFileSync(path, text.slice(0, first) + newText + text.slice(first + oldText.length));
}

replaceOnce(
  'src/app/profile/page.tsx',
  "useState<'/leads' | '/follow-ups' | '/analytics' | '/team'>(",
  "useState<'/dashboard' | '/leads' | '/follow-ups' | '/analytics' | '/team'>("
);
replaceOnce(
  'src/app/profile/page.tsx',
  '<option value="/leads">Pipeline Kanban (/leads)</option>',
  '<option value="/dashboard">Action Center (/dashboard)</option>\n                    <option value="/leads">Pipeline Kanban (/leads)</option>'
);

replaceOnce(
  'src/lib/types.ts',
  "  duplicate_of?: string | null;\n  stage: LeadStage;",
  "  duplicate_of?: string | null;\n  lead_score?: number;\n  lead_temperature?: 'cold' | 'warm' | 'hot';\n  stage: LeadStage;"
);

const storeMarker = '  const profilesWithDynamicLoad = useMemo(() => profiles.map((profile) => ({';
replaceOnce(
  'src/lib/store.tsx',
  storeMarker,
  `  useEffect(() => {\n    if (!isAuthenticated || !currentUserId) return;\n\n    const supabase = getSupabaseBrowserClient();\n    const channel = supabase\n      .channel(\`crm-notifications:\${currentUserId}\`)\n      .on(\n        'postgres_changes',\n        {\n          event: 'INSERT',\n          schema: 'public',\n          table: 'notifications',\n          filter: \`user_id=eq.\${currentUserId}\`,\n        },\n        (payload) => {\n          const incoming = payload.new as AppNotification;\n          setNotificationsList((prev) => [incoming, ...prev.filter((item) => item.id !== incoming.id)]);\n        }\n      )\n      .subscribe();\n\n    return () => {\n      void supabase.removeChannel(channel);\n    };\n  }, [currentUserId, isAuthenticated]);\n\n${storeMarker}`
);

replaceOnce(
  'src/app/settings/page.tsx',
  `  const handleResetDefaults = () => {\n    resetToFactoryDefaults();\n    setShowResetConfirm(false);\n    setBackupStatus({ type: 'success', message: 'CRM restored to pristine initial demo dataset.' });\n    triggerSaveNotification('Factory Defaults Restored');\n  };`,
  `  const handleResetDefaults = () => {\n    setShowResetConfirm(false);\n    setBackupStatus({\n      type: 'error',\n      message: 'Factory reset is disabled. Use a controlled database backup/restore procedure instead.',\n    });\n  };`
);
replaceOnce(
  'src/app/settings/page.tsx',
  'Are you sure? This will wipe current browser storage and restore default demo data.',
  'Browser factory reset is disabled in production. Use a controlled database restore instead.'
);
replaceOnce('src/app/settings/page.tsx', 'Yes, Reset Everything', 'Close');

replaceOnce(
  'src/app/leads/[id]/page.tsx',
  "import LostDealModal from '@/components/leads/LostDealModal';",
  "import LostDealModal from '@/components/leads/LostDealModal';\nimport { getTravelDocumentUrl, removeTravelDocument, uploadTravelDocument } from '@/lib/document-storage';"
);
replaceOnce(
  'src/app/leads/[id]/page.tsx',
  `  const [docTitle, setDocTitle] = useState('');\n  const [docCategory, setDocCategory] = useState<'passport' | 'visa' | 'ticket' | 'hotel_voucher' | 'insurance' | 'other'>('passport');\n  const [docFileName, setDocFileName] = useState('');`,
  `  const [docTitle, setDocTitle] = useState('');\n  const [docCategory, setDocCategory] = useState<'passport' | 'visa' | 'ticket' | 'hotel_voucher' | 'insurance' | 'other'>('passport');\n  const [docFile, setDocFile] = useState<File | null>(null);\n  const [isDocUploading, setIsDocUploading] = useState(false);\n  const [docUploadError, setDocUploadError] = useState('');`
);
replaceOnce(
  'src/app/leads/[id]/page.tsx',
  `  const handleAddDocumentSubmit = (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!docTitle.trim() || !docFileName.trim()) return;\n\n    addDocument(lead.id, {\n      title: docTitle.trim(),\n      category: docCategory,\n      file_name: docFileName.trim(),\n      file_size: '1.2 MB',\n    });\n\n    setDocTitle('');\n    setDocFileName('');\n    setIsAddDocOpen(false);\n  };`,
  `  const handleAddDocumentSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!docTitle.trim() || !docFile || isDocUploading) return;\n\n    setIsDocUploading(true);\n    setDocUploadError('');\n    try {\n      const uploaded = await uploadTravelDocument(lead.id, docFile);\n      addDocument(lead.id, {\n        title: docTitle.trim(),\n        category: docCategory,\n        file_name: uploaded.file_name,\n        file_size: uploaded.file_size,\n        storage_path: uploaded.storage_path,\n      });\n      setDocTitle('');\n      setDocFile(null);\n      setIsAddDocOpen(false);\n    } catch (error) {\n      setDocUploadError(error instanceof Error ? error.message : 'Unable to upload document.');\n    } finally {\n      setIsDocUploading(false);\n    }\n  };\n\n  const handleOpenDocument = async (doc: TravelerDocument) => {\n    if (!doc.storage_path) return;\n    try {\n      const url = await getTravelDocumentUrl(lead.id, doc.storage_path);\n      window.open(url, '_blank', 'noopener,noreferrer');\n    } catch (error) {\n      setDocUploadError(error instanceof Error ? error.message : 'Unable to open document.');\n    }\n  };\n\n  const handleDeleteDocument = async (doc: TravelerDocument) => {\n    try {\n      if (doc.storage_path) await removeTravelDocument(lead.id, doc.storage_path);\n      deleteDocument(lead.id, doc.id);\n    } catch (error) {\n      setDocUploadError(error instanceof Error ? error.message : 'Unable to delete document.');\n    }\n  };`
);
replaceOnce(
  'src/app/leads/[id]/page.tsx',
  `<label className="text-[10px] font-medium text-zinc-600 block">File Name</label>\n                        <input\n                          type="text"\n                          value={docFileName}\n                          onChange={(e) => setDocFileName(e.target.value)}\n                          placeholder="e.g. e_ticket_singapore_airlines.pdf"\n                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"\n                          required\n                        />`,
  `<label className="text-[10px] font-medium text-zinc-600 block">Secure File</label>\n                        <input\n                          type="file"\n                          accept="application/pdf,image/jpeg,image/png,image/webp"\n                          onChange={(e) => setDocFile(e.target.files?.[0] || null)}\n                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"\n                          required\n                        />\n                        <p className="mt-1 text-[9px] text-zinc-400">Private PDF/JPEG/PNG/WebP · max 10 MB</p>\n                        {docUploadError && <p className="mt-1 text-[10px] text-rose-600">{docUploadError}</p>}`
);
replaceOnce(
  'src/app/leads/[id]/page.tsx',
  `                      <button\n                        type="submit"\n                        className="px-3 py-1 bg-zinc-900 text-white rounded text-xs font-medium"\n                      >\n                        Attach Document\n                      </button>`,
  `                      <button\n                        type="submit"\n                        disabled={isDocUploading || !docFile}\n                        className="px-3 py-1 bg-zinc-900 disabled:bg-zinc-400 text-white rounded text-xs font-medium"\n                      >\n                        {isDocUploading ? 'Uploading…' : 'Upload Securely'}\n                      </button>`
);
replaceOnce(
  'src/app/leads/[id]/page.tsx',
  `                        <div className="flex items-center gap-2">\n                          <button\n                            type="button"\n                            onClick={() => deleteDocument(lead.id, doc.id)}\n                            aria-label={\`Delete \${doc.title}\`}\n                            className="text-zinc-400 hover:text-rose-600 p-1"\n                          >\n                            <Trash2 className="w-3.5 h-3.5" />\n                          </button>`,
  `                        <div className="flex items-center gap-2">\n                          {doc.storage_path && (\n                            <button\n                              type="button"\n                              onClick={() => void handleOpenDocument(doc)}\n                              aria-label={\`Open \${doc.title}\`}\n                              className="text-zinc-400 hover:text-blue-600 p-1"\n                            >\n                              <ExternalLink className="w-3.5 h-3.5" />\n                            </button>\n                          )}\n                          <button\n                            type="button"\n                            onClick={() => void handleDeleteDocument(doc)}\n                            aria-label={\`Delete \${doc.title}\`}\n                            className="text-zinc-400 hover:text-rose-600 p-1"\n                          >\n                            <Trash2 className="w-3.5 h-3.5" />\n                          </button>`
);

console.log('Production integration codemod applied successfully.');
