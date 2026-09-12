'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { AgentStatus, Role } from '@/lib/types';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Award,
  Shield,
  Save,
  Check,
  Trophy,
  Briefcase,
  Clock,
  Sparkles,
  Sliders,
  CheckCircle2,
  X,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

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
  'New Zealand',
];

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export default function ProfilePage() {
  const {
    currentUser,
    updateProfile,
    getAgentMetrics,
    getAgentIncentiveProfile,
    playNotificationSound,
    updateUserPreferences,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'details' | 'destinations' | 'routing' | 'security'>('details');

  // Form states initialized with currentUser
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [directExtension, setDirectExtension] = useState(currentUser.direct_extension || '');
  const [officeLocation, setOfficeLocation] = useState(currentUser.office_location || 'San Francisco HQ');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || AVATAR_PRESETS[0]);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [languages, setLanguages] = useState((currentUser.languages || ['English']).join(', '));
  const [destinationTags, setDestinationTags] = useState<string[]>(currentUser.destination_tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(currentUser.max_capacity);
  const [acceptingLeads, setAcceptingLeads] = useState(currentUser.accepting_leads ?? true);
  const [status, setStatus] = useState<AgentStatus>(currentUser.status);

  // Personal Ergonomics & Preferences
  const [kanbanDensity, setKanbanDensity] = useState<'compact' | 'expanded'>(
    currentUser.user_preferences?.kanban_density || 'expanded'
  );
  const [defaultLanding, setDefaultLanding] = useState<'/leads' | '/follow-ups' | '/analytics' | '/team'>(
    currentUser.user_preferences?.default_landing_page || '/leads'
  );
  const [idleAutoAway, setIdleAutoAway] = useState<number>(
    currentUser.user_preferences?.idle_auto_away_minutes ?? 15
  );
  const [directWa, setDirectWa] = useState<boolean>(
    currentUser.user_preferences?.instant_whatsapp_direct ?? false
  );
  const [countryCode, setCountryCode] = useState<string>(
    currentUser.user_preferences?.default_country_code || '+1'
  );

  // Success toast state
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Sync state whenever currentUser changes (e.g. from role switcher)
  useEffect(() => {
    setFullName(currentUser.full_name);
    setEmail(currentUser.email);
    setPhone(currentUser.phone || '');
    setDirectExtension(currentUser.direct_extension || '');
    setOfficeLocation(currentUser.office_location || 'San Francisco HQ');
    setAvatarUrl(currentUser.avatar_url || AVATAR_PRESETS[0]);
    setBio(currentUser.bio || '');
    setLanguages((currentUser.languages || ['English']).join(', '));
    setDestinationTags(currentUser.destination_tags || []);
    setMaxCapacity(currentUser.max_capacity);
    setAcceptingLeads(currentUser.accepting_leads ?? true);
    setStatus(currentUser.status);

    const up = currentUser.user_preferences;
    if (up) {
      setKanbanDensity(up.kanban_density);
      setDefaultLanding(up.default_landing_page);
      setIdleAutoAway(up.idle_auto_away_minutes);
      setDirectWa(up.instant_whatsapp_direct);
      setCountryCode(up.default_country_code);
    }
  }, [currentUser]);

  const metrics = getAgentMetrics(currentUser.id);
  const incentive = getAgentIncentiveProfile(currentUser.id);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const parsedLanguages = languages
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    updateProfile(currentUser.id, {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      direct_extension: directExtension.trim() || undefined,
      office_location: officeLocation.trim() || undefined,
      avatar_url: avatarUrl.trim(),
      bio: bio.trim(),
      languages: parsedLanguages.length > 0 ? parsedLanguages : ['English'],
      destination_tags: destinationTags,
      max_capacity: Number(maxCapacity) || 25,
      accepting_leads: acceptingLeads,
      status,
      user_preferences: {
        kanban_density: kanbanDensity,
        default_landing_page: defaultLanding,
        idle_auto_away_minutes: Number(idleAutoAway),
        instant_whatsapp_direct: directWa,
        default_country_code: countryCode,
      },
    });

    updateUserPreferences(currentUser.id, {
      kanban_density: kanbanDensity,
      default_landing_page: defaultLanding,
      idle_auto_away_minutes: Number(idleAutoAway),
      instant_whatsapp_direct: directWa,
      default_country_code: countryCode,
    });

    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2500);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      if (!destinationTags.includes(newTagInput.trim())) {
        setDestinationTags([...destinationTags, newTagInput.trim()]);
      }
      setNewTagInput('');
    }
  };

  const handleToggleDestination = (dest: string) => {
    if (destinationTags.includes(dest)) {
      setDestinationTags(destinationTags.filter((d) => d !== dest));
    } else {
      setDestinationTags([...destinationTags, dest]);
    }
  };

  const getStatusDotColor = (st: AgentStatus) => {
    switch (st) {
      case 'available':
        return 'bg-emerald-500';
      case 'in_call':
        return 'bg-blue-500';
      case 'on_break':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-zinc-400';
      default:
        return 'bg-zinc-400';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 text-xs">
      {/* Toast Notification */}
      {showSavedToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 text-white px-3.5 py-2 rounded-md shadow-lg border border-zinc-800 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium text-xs">Profile changes saved successfully</span>
        </div>
      )}

      {/* Top Banner / Hero Card */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 relative px-6 flex items-end">
          <div className="absolute top-3 right-4 flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-300">
              {currentUser.employee_code || 'EMP-001'}
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700 text-zinc-200 text-[10px] font-mono uppercase tracking-wider">
              {currentUser.role}
            </span>
          </div>
        </div>

        <div className="px-6 pb-5 pt-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-end gap-4 -mt-10">
            <div className="relative">
              <img
                src={avatarUrl}
                alt={fullName}
                className="w-16 h-16 rounded-full object-cover border-3 border-white shadow-md bg-white"
              />
              <span
                className={`w-3.5 h-3.5 rounded-full border-2 border-white absolute bottom-0.5 right-0.5 ${getStatusDotColor(
                  status
                )}`}
              />
            </div>

            <div>
              <h1 className="text-lg font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
                <span>{fullName}</span>
              </h1>
              <div className="text-zinc-500 font-mono text-[11px] flex items-center gap-2 mt-0.5">
                <span>{email}</span>
                {directExtension && (
                  <>
                    <span>•</span>
                    <span className="text-zinc-700 font-medium">{directExtension}</span>
                  </>
                )}
                <span>•</span>
                <span>{officeLocation}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Status Selector */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AgentStatus)}
              className="text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-zinc-50 font-medium text-zinc-800 focus:bg-white focus:outline-none"
            >
              <option value="available">🟢 Available</option>
              <option value="in_call">🔵 In Client Call</option>
              <option value="on_break">🟡 On Break</option>
              <option value="offline">⚪ Offline</option>
            </select>

            <button
              onClick={() => handleSave()}
              className="px-3.5 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-zinc-100 bg-zinc-50/50 divide-x divide-zinc-100">
          <div className="px-5 py-2.5">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight block">
              Active Pipeline
            </span>
            <span className="text-sm font-mono font-medium text-zinc-900">
              {metrics.activeLeads} / {maxCapacity} leads
            </span>
          </div>

          <div className="px-5 py-2.5">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight block">
              Deals Converted
            </span>
            <span className="text-sm font-mono font-medium text-zinc-900">
              {metrics.wonCount} won{' '}
              <span className="text-xs text-zinc-400 font-sans">({metrics.winRate}%)</span>
            </span>
          </div>

          <div className="px-5 py-2.5">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight block">
              Gross Profit
            </span>
            <span className="text-sm font-mono font-medium text-emerald-700">
              +${metrics.grossProfit.toLocaleString()}
            </span>
          </div>

          <div className="px-5 py-2.5">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight block">
              Incentive Tier
            </span>
            <span className="text-sm font-mono font-medium text-zinc-900 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-500" />
              <span>{incentive.currentTier.name}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-1 flex items-center gap-1">
        {[
          { id: 'details', label: 'Personal & Contact Information', icon: User },
          { id: 'destinations', label: 'Destination Specializations', icon: Globe },
          { id: 'routing', label: 'Inbound Routing & Capacity', icon: Sliders },
          { id: 'security', label: 'Preferences & Notifications', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-5">
        {/* TAB 1: PERSONAL & CONTACT INFORMATION */}
        {activeTab === 'details' && (
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Personal Information
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Update your professional profile details shown across leads and team dossiers
              </p>
            </div>

            {/* Avatar Picker */}
            <div className="pt-2 border-t border-zinc-100">
              <label className="block text-[11px] font-medium text-zinc-700 mb-2">
                Profile Avatar
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-12 h-12 rounded-full object-cover border border-zinc-200"
                />
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500">Quick Presets:</span>
                    {AVATAR_PRESETS.map((url, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => setAvatarUrl(url)}
                        className={`w-6 h-6 rounded-full overflow-hidden border-2 transition ${
                          avatarUrl === url ? 'border-zinc-900 scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Preset ${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="Or enter custom avatar image URL..."
                    className="w-full text-xs px-2.5 py-1 border border-zinc-200 rounded-md bg-zinc-50 font-mono text-zinc-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-100">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white font-mono text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            {/* Phone, Extension, Location */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Direct Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 415 555 0102"
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white font-mono text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Extension
                </label>
                <input
                  type="text"
                  value={directExtension}
                  onChange={(e) => setDirectExtension(e.target.value)}
                  placeholder="Ext. 103"
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white font-mono text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Office / Remote Base
                </label>
                <input
                  type="text"
                  value={officeLocation}
                  onChange={(e) => setOfficeLocation(e.target.value)}
                  placeholder="San Francisco HQ"
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                Languages Spoken (comma separated)
              </label>
              <input
                type="text"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="English, Spanish, French"
                className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                Consultant Bio & Itinerary Specialization
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Describe your travel background, destination specialties, and signature experiences..."
                className="w-full text-xs p-3 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400 resize-none leading-relaxed"
              />
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-100">
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" /> Save Changes
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: DESTINATION SPECIALIZATIONS */}
        {activeTab === 'destinations' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Destination Specializations & Routing Tags
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Leads requesting these destinations will be preferentially routed to you via the smart round-robin engine
              </p>
            </div>

            {/* Active Tags */}
            <div className="pt-2 border-t border-zinc-100 space-y-2">
              <label className="block text-[11px] font-medium text-zinc-700">
                Your Active Destination Tags ({destinationTags.length})
              </label>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-zinc-50 border border-zinc-200 min-h-[48px]">
                {destinationTags.length === 0 ? (
                  <span className="text-zinc-400 italic">No destination tags configured yet.</span>
                ) : (
                  destinationTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-800 font-medium text-xs shadow-2xs"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleDestination(tag)}
                        className="text-zinc-400 hover:text-zinc-700 rounded-full"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add Custom Tag */}
              <div className="flex items-center gap-2 max-w-sm pt-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Type custom region and press Enter..."
                  className="flex-1 text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTagInput.trim() && !destinationTags.includes(newTagInput.trim())) {
                      setDestinationTags([...destinationTags, newTagInput.trim()]);
                      setNewTagInput('');
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-md border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium flex items-center gap-1 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* Quick Suggestions */}
            <div className="pt-2 border-t border-zinc-100">
              <label className="block text-[11px] font-medium text-zinc-700 mb-2">
                Click to Add / Remove Common Destinations
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_DESTINATIONS.map((dest) => {
                  const isActive = destinationTags.includes(dest);
                  return (
                    <button
                      type="button"
                      key={dest}
                      onClick={() => handleToggleDestination(dest)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      {isActive && <Check className="w-3 h-3" />}
                      <span>{dest}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-4 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" /> Save Specializations
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: INBOUND ROUTING & CAPACITY */}
        {activeTab === 'routing' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Lead Distribution & Workload Capacity
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Configure your availability for new inquiries and concurrent lead thresholds
              </p>
            </div>

            {/* Auto Assignment Toggle */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <div>
                <div className="font-medium text-zinc-900 text-xs">
                  Participate in Round-Robin Lead Distribution
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  When enabled, newly ingested web and Meta inquiries matching your destination tags will automatically be assigned to you.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={acceptingLeads}
                  onChange={(e) => setAcceptingLeads(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900"></div>
              </label>
            </div>

            {/* Max Capacity Setting */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Maximum Concurrent Active Inquiries
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(Number(e.target.value))}
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-md bg-white font-mono text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  When active leads reach this limit, the system skips your queue to prevent SLA breaches.
                </p>
              </div>

              {/* Live Workload Gauge */}
              <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-500 font-medium text-[10px] uppercase">
                    Current Capacity Utilization
                  </span>
                  <span className="font-mono font-medium text-zinc-900">
                    {metrics.activeLeads} / {maxCapacity} ({Math.min(100, Math.round((metrics.activeLeads / maxCapacity) * 100))}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${
                      metrics.activeLeads >= maxCapacity
                        ? 'bg-red-500'
                        : metrics.activeLeads / maxCapacity >= 0.7
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((metrics.activeLeads / maxCapacity) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-2">
                  {maxCapacity - metrics.activeLeads > 0
                    ? `You can accept ${maxCapacity - metrics.activeLeads} more leads before reaching capacity.`
                    : 'You are at maximum capacity.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-4 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" /> Save Routing Settings
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: PREFERENCES & NOTIFICATIONS */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                Consultant Workspace Preferences
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Tailor your personal pipeline density, dispatch shortcuts, and auto-away timers
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-100 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Kanban Card Density */}
                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    Pipeline Kanban Density
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setKanbanDensity('expanded')}
                      className={`p-2 rounded border text-xs font-medium transition text-left ${
                        kanbanDensity === 'expanded'
                          ? 'border-zinc-900 bg-white text-zinc-900 shadow-2xs font-semibold'
                          : 'border-zinc-200 bg-zinc-100/50 text-zinc-500 hover:bg-white'
                      }`}
                    >
                      <div className="font-semibold">Expanded</div>
                      <div className="text-[10px] text-zinc-400 font-normal">Pills, tags & budgets</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKanbanDensity('compact')}
                      className={`p-2 rounded border text-xs font-medium transition text-left ${
                        kanbanDensity === 'compact'
                          ? 'border-zinc-900 bg-white text-zinc-900 shadow-2xs font-semibold'
                          : 'border-zinc-200 bg-zinc-100/50 text-zinc-500 hover:bg-white'
                      }`}
                    >
                      <div className="font-semibold">Compact</div>
                      <div className="text-[10px] text-zinc-400 font-normal">Minimal high-density</div>
                    </button>
                  </div>
                </div>

                {/* Default Landing Page */}
                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    Default Landing Route
                  </label>
                  <select
                    value={defaultLanding}
                    onChange={(e) => setDefaultLanding(e.target.value as any)}
                    aria-label="Default landing route"
                    className="w-full border border-zinc-200 rounded p-2 text-xs bg-white text-zinc-900 font-medium"
                  >
                    <option value="/leads">Pipeline Kanban (/leads)</option>
                    <option value="/follow-ups">Follow-Ups Agenda (/follow-ups)</option>
                    <option value="/analytics">Performance Analytics (/analytics)</option>
                  </select>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    The initial screen presented when opening Wanderlust LMS.
                  </p>
                </div>

                {/* Idle Auto-Away Timeout */}
                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    Idle Auto-Away Threshold
                  </label>
                  <select
                    value={idleAutoAway}
                    onChange={(e) => setIdleAutoAway(Number(e.target.value))}
                    aria-label="Idle auto-away threshold"
                    className="w-full border border-zinc-200 rounded p-2 text-xs bg-white text-zinc-900 font-medium"
                  >
                    <option value={5}>5 Minutes</option>
                    <option value={15}>15 Minutes (Recommended)</option>
                    <option value={30}>30 Minutes</option>
                    <option value={0}>Disabled (Stay Online)</option>
                  </select>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Automatically switches status to "On Break" after inactivity.
                  </p>
                </div>

                {/* Default Phone Country Code */}
                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    Default Country Code Prefix
                  </label>
                  <input
                    type="text"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    placeholder="+1 or +91"
                    aria-label="Default country code prefix"
                    className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white text-zinc-900 font-medium"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Pre-fills in the intake form for quick customer telephone entry.
                  </p>
                </div>
              </div>

              {/* Toggles & Sound Test */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                  <div>
                    <div className="font-medium text-zinc-900 text-xs">
                      Instant WhatsApp Web Dispatch
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Skip the template preview dialog and launch WhatsApp Web directly on one click.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={directWa}
                    onChange={(e) => setDirectWa(e.target.checked)}
                    aria-label="Instant WhatsApp Web Dispatch"
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-0"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                  <div>
                    <div className="font-medium text-zinc-900 text-xs">
                      Audio Chime Test Sound
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Verify your current browser audio synthesizer output and volume.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => playNotificationSound()}
                    aria-label="Test notification sound chime"
                    className="px-2.5 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition"
                  >
                    🔊 Test Chime
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-4 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" /> Save Workspace Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
