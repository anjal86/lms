'use client';

import React, { useState } from 'react';
import { Role, AgentStatus } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, UserPlus, Sparkles, Check } from 'lucide-react';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COMMON_DESTINATIONS = [
  'Bali',
  'Thailand',
  'Vietnam',
  'Singapore',
  'Switzerland',
  'Paris',
  'Italy',
  'Europe',
  'Greece',
  'Dubai',
  'Maldives',
  'Mauritius',
  'Egypt',
  'Japan',
  'Australia',
  'USA',
];

export default function InviteMemberModal({
  isOpen,
  onClose,
  onSuccess,
}: InviteMemberModalProps) {
  const { createProfile, showToast, currentUser } = useApp();
  useDialog(isOpen, onClose);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+1 415 555 ');
  const [directExtension, setDirectExtension] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [officeLocation, setOfficeLocation] = useState('San Francisco HQ');
  const [maxCapacity, setMaxCapacity] = useState(25);
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState('English');
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(['Bali', 'Asia']);
  const [acceptingLeads, setAcceptingLeads] = useState(true);

  if (!isOpen) return null;

  const toggleDestination = (dest: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(dest) ? prev.filter((d) => d !== dest) : [...prev, dest]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    // Pick a pleasing avatar based on name initials or stock unsplash
    const avatars = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    ];
    const pickedAvatar = avatars[Math.floor(Math.random() * avatars.length)];

    const createdProfile = await createProfile({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      direct_extension: directExtension.trim() || undefined,
      role,
      avatar_url: pickedAvatar,
      destination_tags: selectedDestinations.length > 0 ? selectedDestinations : ['Global'],
      max_capacity: Number(maxCapacity) || 25,
      status: 'available' as AgentStatus,
      is_active: true,
      accepting_leads: role === 'agent' ? acceptingLeads : false,
      bio: bio.trim() || 'Travel destination consultant dedicated to custom itineraries.',
      languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
      office_location: officeLocation,
      certifications: ['Virtuoso Partner Specialist'],
    });

    if (!createdProfile) return;
    showToast(`Invitation sent to ${fullName.trim()}`, 'success');
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-100 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center">
              <UserPlus className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 id="invite-member-title" className="font-semibold text-zinc-900 tracking-tight">
                Add Team Member / Consultant
              </h3>
              <p className="text-[11px] text-zinc-500">
                Configure profile, specializations, and lead routing limits
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Liam Scott"
                  className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="liam@travellms.com"
                  className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400 font-mono"
                />
              </div>
            </div>

            {/* Role & Phone */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full text-xs px-2 py-1.5 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400"
                >
                  <option value="agent">Travel Consultant</option>
                  {currentUser.role === 'admin' && <option value="manager">Sales Manager</option>}
                  {currentUser.role === 'admin' && <option value="admin">Super Admin</option>}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">Phone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">Extension</label>
                <input
                  type="text"
                  value={directExtension}
                  onChange={(e) => setDirectExtension(e.target.value)}
                  placeholder="Ext. 106"
                  className="w-full text-xs px-2 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400 font-mono"
                />
              </div>
            </div>

            {/* Location & Capacity */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Office / Remote Location
                </label>
                <input
                  type="text"
                  value={officeLocation}
                  onChange={(e) => setOfficeLocation(e.target.value)}
                  placeholder="San Francisco HQ"
                  className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Max Active Lead Capacity
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(Number(e.target.value))}
                  className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400 font-mono"
                />
              </div>
            </div>

            {/* Destination Specializations */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-zinc-700">
                  Destination Expertise Tags
                </label>
                <span className="text-[10px] text-zinc-400">
                  {selectedDestinations.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-50 border border-zinc-200 rounded-md max-h-24 overflow-y-auto">
                {COMMON_DESTINATIONS.map((dest) => {
                  const isSelected = selectedDestinations.includes(dest);
                  return (
                    <button
                      type="button"
                      key={dest}
                      onClick={() => toggleDestination(dest)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-1 ${
                        isSelected
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                      {dest}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Languages & Lead Routing */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Languages Spoken
                </label>
                <input
                  type="text"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="English, French, German"
                  className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="acceptingLeadsCheck"
                  checked={acceptingLeads}
                  onChange={(e) => setAcceptingLeads(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0"
                />
                <label htmlFor="acceptingLeadsCheck" className="text-[11px] text-zinc-800 font-medium cursor-pointer">
                  Accept auto-assigned leads
                </label>
              </div>
            </div>

            {/* Short Bio */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                Consultant Bio / Specialization Notes
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Key itinerary specialties, DMC relationships, resort partnerships..."
                className="w-full text-xs p-2 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400 resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-zinc-50/70 border-t border-zinc-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
            >
              <UserPlus className="w-3.5 h-3.5" /> Onboard Team Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
