'use client';

import React, { useState, useEffect } from 'react';
import { ItineraryDay, MealPlanCode } from '@/lib/types';
import { useDialog } from '@/lib/useDialog';
import { X, Calendar, Plus, Trash2, Hotel, Utensils } from 'lucide-react';

interface ItineraryDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (day: ItineraryDay) => void;
  dayToEdit?: ItineraryDay | null;
  suggestedDayNumber: number;
}

export default function ItineraryDayModal({
  isOpen,
  onClose,
  onSave,
  dayToEdit,
  suggestedDayNumber,
}: ItineraryDayModalProps) {
  useDialog(isOpen, onClose);
  const [dayNumber, setDayNumber] = useState(suggestedDayNumber);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [mealPlan, setMealPlan] = useState<MealPlanCode>('CP');
  const [morningActivity, setMorningActivity] = useState('');
  const [afternoonActivity, setAfternoonActivity] = useState('');
  const [eveningActivity, setEveningActivity] = useState('');
  const [activities, setActivities] = useState<string[]>([]);
  const [activityInput, setActivityInput] = useState('');

  useEffect(() => {
    if (dayToEdit) {
      setDayNumber(dayToEdit.day_number);
      setTitle(dayToEdit.title);
      setDescription(dayToEdit.description);
      setHotelName(dayToEdit.hotel_name || '');
      setMealPlan(dayToEdit.meal_plan);
      setMorningActivity(dayToEdit.morning_activity || '');
      setAfternoonActivity(dayToEdit.afternoon_activity || '');
      setEveningActivity(dayToEdit.evening_activity || '');
      setActivities(dayToEdit.activities || []);
    } else {
      setDayNumber(suggestedDayNumber);
      setTitle('');
      setDescription('');
      setHotelName('');
      setMealPlan('CP');
      setMorningActivity('');
      setAfternoonActivity('');
      setEveningActivity('');
      setActivities([]);
    }
  }, [dayToEdit, suggestedDayNumber, isOpen]);

  if (!isOpen) return null;

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityInput.trim()) return;
    setActivities([...activities, activityInput.trim()]);
    setActivityInput('');
  };

  const handleRemoveActivity = (idx: number) => {
    setActivities(activities.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newDay: ItineraryDay = {
      id: dayToEdit ? dayToEdit.id : `day-${Date.now()}`,
      day_number: Number(dayNumber),
      title: title.trim(),
      description: description.trim(),
      hotel_name: hotelName.trim() || undefined,
      meal_plan: mealPlan,
      morning_activity: morningActivity.trim() || undefined,
      afternoon_activity: afternoonActivity.trim() || undefined,
      evening_activity: eveningActivity.trim() || undefined,
      activities: activities.length > 0 ? activities : [title.trim()],
    };

    onSave(newDay);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Itinerary Day"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-lg border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-semibold text-zinc-900">
              {dayToEdit ? `Edit Day ${dayToEdit.day_number} Schedule` : `Add Day ${dayNumber} Itinerary`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto text-xs">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1 space-y-1">
              <label className="block text-[11px] font-medium text-zinc-700">Day #</label>
              <input
                type="number"
                min="1"
                max="60"
                value={dayNumber}
                onChange={(e) => setDayNumber(Number(e.target.value))}
                className="w-full border border-zinc-200 rounded p-1.5 font-mono font-bold text-center text-xs"
                required
              />
            </div>

            <div className="col-span-3 space-y-1">
              <label className="block text-[11px] font-medium text-zinc-700">Day Title / Headline</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Arrival in Denpasar & Private Ubud Transfer"
                className="w-full border border-zinc-200 rounded p-1.5 text-xs focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-700">Day Experience Overview</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief sensory description of what the traveler will see and experience today..."
              className="w-full border border-zinc-200 rounded p-2 text-xs focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-100">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700 flex items-center gap-1">
                <Hotel className="w-3.5 h-3.5 text-zinc-500" /> Accommodation / Resort
              </label>
              <input
                type="text"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="e.g. Kamandalu Ubud Pool Villa"
                className="w-full border border-zinc-200 rounded p-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700 flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5 text-zinc-500" /> Meal Plan Code
              </label>
              <select
                value={mealPlan}
                onChange={(e) => setMealPlan(e.target.value as MealPlanCode)}
                className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
              >
                <option value="EP">EP — Room Only (No Meals)</option>
                <option value="CP">CP — Continental Plan (Bed & Breakfast)</option>
                <option value="MAP">MAP — Modified Plan (Breakfast + Dinner)</option>
                <option value="AP">AP — American Plan (Breakfast + Lunch + Dinner)</option>
                <option value="AI">AI — All Inclusive (All Meals + Selected Beverages)</option>
              </select>
            </div>
          </div>

          {/* Time of Day Breakdown */}
          <div className="space-y-2 pt-1 border-t border-zinc-100">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 block tracking-tight">
              Time of Day Schedule (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500 block">Morning</span>
                <input
                  type="text"
                  value={morningActivity}
                  onChange={(e) => setMorningActivity(e.target.value)}
                  placeholder="e.g. Floating breakfast"
                  className="w-full border border-zinc-200 rounded p-1 text-[11px]"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Afternoon</span>
                <input
                  type="text"
                  value={afternoonActivity}
                  onChange={(e) => setAfternoonActivity(e.target.value)}
                  placeholder="e.g. Rice terrace swing"
                  className="w-full border border-zinc-200 rounded p-1 text-[11px]"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Evening</span>
                <input
                  type="text"
                  value={eveningActivity}
                  onChange={(e) => setEveningActivity(e.target.value)}
                  placeholder="e.g. Candlelight dinner"
                  className="w-full border border-zinc-200 rounded p-1 text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* Activity Bullet Highlights */}
          <div className="space-y-2 pt-1 border-t border-zinc-100">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 block tracking-tight">
              Activity Highlights
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={activityInput}
                onChange={(e) => setActivityInput(e.target.value)}
                placeholder="e.g. Private AC vehicle with licensed driver"
                className="flex-1 border border-zinc-200 rounded p-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleAddActivity}
                className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-xs font-medium"
              >
                Add Highlight
              </button>
            </div>

            {activities.length > 0 && (
              <ul className="space-y-1 pt-1 max-h-32 overflow-y-auto">
                {activities.map((act, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between p-1.5 bg-zinc-50 rounded border border-zinc-200 text-zinc-700 text-[11px]"
                  >
                    <span>• {act}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveActivity(idx)}
                      className="text-zinc-400 hover:text-red-600 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-3 border-t border-zinc-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-md text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium shadow-2xs"
            >
              {dayToEdit ? 'Save Changes' : 'Add Day to Itinerary'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
