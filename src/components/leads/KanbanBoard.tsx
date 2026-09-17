'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Lead, LeadStage } from '@/lib/types';
import { useApp } from '@/lib/store';
import SlaBadge from './SlaBadge';
import QuickLogModal from './QuickLogModal';
import WhatsAppModal from './WhatsAppModal';
import WinDealModal from './WinDealModal';
import LostDealModal from './LostDealModal';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Phone, MessageSquare, MapPin, GripVertical } from 'lucide-react';

const STAGES: { id: LeadStage; title: string; dotColor: string }[] = [
  { id: 'new',            title: 'New',         dotColor: 'bg-blue-500'    },
  { id: 'contacted',      title: 'Contacted',   dotColor: 'bg-cyan-500'    },
  { id: 'quote_sent',     title: 'Quote Sent',  dotColor: 'bg-purple-500'  },
  { id: 'in_negotiation', title: 'Negotiating', dotColor: 'bg-amber-500'   },
  { id: 'won',            title: 'Won',         dotColor: 'bg-emerald-500' },
  { id: 'lost',           title: 'Lost',        dotColor: 'bg-zinc-400'    },
];

function DroppableColumn({ stageId, isOver, children }: { stageId: LeadStage; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: stageId });
  return (
    <div ref={setNodeRef} className={`p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] rounded-b-lg transition-colors duration-150 ${isOver ? 'bg-zinc-200/50' : ''}`}>
      {children}
    </div>
  );
}

function DraggableCard({ lead, isCompact, isDragging, onWhatsApp, onLog, onStageChange, assignedAgent }: {
  lead: Lead; isCompact: boolean; isDragging: boolean;
  onWhatsApp: () => void; onLog: () => void; onStageChange: (s: LeadStage) => void;
  assignedAgent?: { full_name: string; avatar_url?: string };
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id });
  const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: 50, position: 'relative' as const } : undefined;

  const grip = (
    <button {...listeners} {...attributes} aria-label={`Drag ${lead.lead_code}`} className="p-0.5 text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing touch-none shrink-0">
      <GripVertical className="w-3 h-3" />
    </button>
  );

  const actions = (
    <div className="flex items-center gap-0.5">
      <button onClick={onWhatsApp} aria-label={`WhatsApp ${lead.customer_name}`} className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition cursor-pointer"><MessageSquare className="w-3 h-3" /></button>
      <button onClick={onLog} aria-label={`Log call ${lead.customer_name}`} className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition cursor-pointer"><Phone className="w-3 h-3" /></button>
      <select value={lead.stage} aria-label={`Stage ${lead.lead_code}`} onChange={(e) => onStageChange(e.target.value as LeadStage)} onClick={(e) => e.stopPropagation()} className="text-[10px] bg-zinc-50 border border-zinc-200 rounded px-1 py-0.5 text-zinc-600 focus:outline-none cursor-pointer">
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="quote_sent">Quote Sent</option>
        <option value="in_negotiation">Negotiating</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-md border border-zinc-200 shadow-2xs hover:border-zinc-300 hover:shadow-sm transition-all select-none ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}>
      {isCompact ? (
        <div className="p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            {grip}
            <span className="font-mono text-[10px] text-zinc-400 shrink-0">{lead.lead_code}</span>
            <span className="text-zinc-300 shrink-0">·</span>
            <Link href={`/leads/${lead.id}`} className="text-xs font-semibold text-zinc-900 truncate hover:underline" onClick={(e) => e.stopPropagation()}>{lead.customer_name}</Link>
            <div className="ml-auto shrink-0"><SlaBadge lead={lead} /></div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
            <div className="flex items-center gap-1 truncate max-w-[130px]">
              <MapPin className="w-2.5 h-2.5 text-zinc-400 shrink-0" /><span className="truncate">{lead.destination}</span>
              <span className="text-zinc-300 shrink-0">·</span><span className="font-mono text-zinc-700 shrink-0">{lead.budget_range || '$2k'}</span>
            </div>
            {actions}
          </div>
        </div>
      ) : (
        <div className="p-2.5">
          <div className="flex items-center gap-1 mb-1.5">{grip}<span className="font-mono text-[10px] text-zinc-400 font-medium">{lead.lead_code}</span><div className="ml-auto shrink-0"><SlaBadge lead={lead} /></div></div>
          <Link href={`/leads/${lead.id}`} className="block hover:text-zinc-900 transition" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-semibold text-zinc-900 leading-snug">{lead.customer_name}</div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 mt-0.5"><MapPin className="w-3 h-3 text-zinc-400" /><span>{lead.destination}</span><span>·</span><span className="font-mono text-zinc-700">{lead.budget_range || '$2k'}</span></div>
          </Link>
          <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-1.5">
              {assignedAgent ? (<img src={assignedAgent.avatar_url} alt={assignedAgent.full_name} className="w-4 h-4 rounded-full object-cover" />) : (<span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />)}
              <span className="truncate max-w-[80px]">{assignedAgent ? assignedAgent.full_name.split(' ')[0] : 'Unassigned'}</span>
            </div>
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}

function GhostCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-white rounded-md border border-zinc-400 shadow-lg p-2.5 w-72 rotate-1 opacity-95 cursor-grabbing pointer-events-none">
      <div className="flex items-center gap-1.5 mb-1"><span className="font-mono text-[10px] text-zinc-400">{lead.lead_code}</span><span className="text-zinc-300">·</span><span className="text-xs font-semibold text-zinc-900 truncate">{lead.customer_name}</span></div>
      <div className="flex items-center gap-1 text-[11px] text-zinc-500"><MapPin className="w-3 h-3 text-zinc-400" /><span>{lead.destination}</span><span>·</span><span className="font-mono text-zinc-700">{lead.budget_range || '$2k'}</span></div>
    </div>
  );
}

export default function KanbanBoard({ filteredLeads }: { filteredLeads: Lead[] }) {
  const { allProfiles, updateLeadStage, currentUser } = useApp();
  const isCompact = currentUser.user_preferences?.kanban_density === 'compact';

  const [activeLogLead,  setActiveLogLead]  = useState<Lead | null>(null);
  const [activeWaLead,   setActiveWaLead]   = useState<Lead | null>(null);
  const [activeWinLead,  setActiveWinLead]  = useState<Lead | null>(null);
  const [activeLostLead, setActiveLostLead] = useState<Lead | null>(null);
  const [draggedLeadId,  setDraggedLeadId]  = useState<string | null>(null);
  const [overStageId,    setOverStageId]    = useState<LeadStage | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const draggedLead = draggedLeadId ? filteredLeads.find((l) => l.id === draggedLeadId) ?? null : null;

  const handleDragStart = ({ active }: DragStartEvent) => setDraggedLeadId(active.id as string);
  const handleDragOver  = ({ over }: DragOverEvent)    => setOverStageId((over?.id as LeadStage) ?? null);
  const handleDragEnd   = ({ active, over }: DragEndEvent) => {
    setDraggedLeadId(null); setOverStageId(null);
    if (!over) return;
    const lead = filteredLeads.find((l) => l.id === active.id);
    const targetStage = over.id as LeadStage;
    if (!lead || lead.stage === targetStage) return;
    if (targetStage === 'won')  { setActiveWinLead(lead);  return; }
    if (targetStage === 'lost') { setActiveLostLead(lead); return; }
    updateLeadStage(lead.id, targetStage);
  };

  const handleStageChange = (lead: Lead, next: LeadStage) => {
    if (next === 'won')  { setActiveWinLead(lead);  return; }
    if (next === 'lost') { setActiveLostLead(lead); return; }
    updateLeadStage(lead.id, next);
  };

  const handleWhatsAppClick = (lead: Lead) => {
    if (currentUser.user_preferences?.instant_whatsapp_direct && lead.customer_phone) {
      const clean = lead.customer_phone.replace(/[^0-9]/g, '');
      if (clean) { window.open(`https://wa.me/${clean}?text=Hi%20${encodeURIComponent(lead.customer_name)}`, '_blank'); return; }
    }
    setActiveWaLead(lead);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1 min-h-[calc(100vh-230px)]">
          {STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
            const isOver = overStageId === stage.id;
            return (
              <div key={stage.id} className={`w-72 flex-shrink-0 flex flex-col rounded-lg border transition-all duration-150 ${isOver ? 'border-zinc-400 bg-zinc-100/80 shadow-md' : 'border-zinc-200 bg-zinc-50/60 shadow-2xs'}`}>
                <div className="px-3 py-2 border-b border-zinc-200/80 flex items-center justify-between bg-white rounded-t-lg">
                  <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${stage.dotColor}`} /><span className="text-xs font-semibold text-zinc-800 tracking-tight">{stage.title}</span></div>
                  <span className="text-[11px] font-mono text-zinc-400 font-medium">{stageLeads.length}</span>
                </div>
                <DroppableColumn stageId={stage.id} isOver={isOver}>
                  {stageLeads.length === 0 ? (
                    <div className={`h-24 border border-dashed rounded-md flex items-center justify-center text-[11px] font-mono transition-colors ${isOver ? 'border-zinc-400 text-zinc-500 bg-zinc-100/60' : 'border-zinc-200 text-zinc-400'}`}>
                      {isOver ? 'Drop here' : 'empty'}
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <DraggableCard key={lead.id} lead={lead} isCompact={isCompact} isDragging={lead.id === draggedLeadId}
                        assignedAgent={allProfiles.find((p) => p.id === lead.assigned_to)}
                        onWhatsApp={() => handleWhatsAppClick(lead)} onLog={() => setActiveLogLead(lead)}
                        onStageChange={(s) => handleStageChange(lead, s)} />
                    ))
                  )}
                </DroppableColumn>
              </div>
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
          {draggedLead ? <GhostCard lead={draggedLead} /> : null}
        </DragOverlay>
      </DndContext>

      {activeLogLead  && <QuickLogModal  lead={activeLogLead}  isOpen onClose={() => setActiveLogLead(null)}  />}
      {activeWaLead   && <WhatsAppModal  lead={activeWaLead}   isOpen onClose={() => setActiveWaLead(null)}   />}
      {activeWinLead  && <WinDealModal   lead={activeWinLead}  isOpen onClose={() => setActiveWinLead(null)}  />}
      {activeLostLead && <LostDealModal  lead={activeLostLead} isOpen onClose={() => setActiveLostLead(null)} />}
    </>
  );
}
