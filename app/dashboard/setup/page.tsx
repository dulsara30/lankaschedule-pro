'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface IntervalSlot {
  afterPeriod: number;
  duration: number;
}

interface SchoolConfig {
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
  intervalSlots: IntervalSlot[];
}

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [address, setAddress] = useState('');
  const [config, setConfig] = useState<SchoolConfig>({
    startTime: '07:30',
    periodDuration: 50,
    numberOfPeriods: 7,
    intervalSlots: [
      { afterPeriod: 2, duration: 15 },
      { afterPeriod: 4, duration: 15 },
    ],
  });

  useEffect(() => {
    // Fetch existing config
    fetch('/api/school/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setSchoolName(data.data.name || '');
          setAddress(data.data.address || '');
          if (data.data.config) {
            setConfig(data.data.config);
          }
        }
      })
      .catch(() => {
        // Config doesn't exist yet, use defaults
      });
  }, []);

  const addIntervalSlot = () => {
    setConfig({
      ...config,
      intervalSlots: [...config.intervalSlots, { afterPeriod: 1, duration: 10 }],
    });
  };

  const removeIntervalSlot = (index: number) => {
    setConfig({
      ...config,
      intervalSlots: config.intervalSlots.filter((_, i) => i !== index),
    });
  };

  const updateIntervalSlot = (index: number, field: 'afterPeriod' | 'duration', value: number) => {
    const updated = [...config.intervalSlots];
    updated[index][field] = value;
    setConfig({ ...config, intervalSlots: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/school/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schoolName,
          address,
          config,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('School configuration saved successfully!');
        // Trigger sidebar refresh by dispatching a custom event
        window.dispatchEvent(new Event('schoolConfigUpdated'));
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          School Setup
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Configure your school&apos;s basic information and timetable settings
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* School Information */}
          <Card>
            <CardHeader>
              <CardTitle>School Information</CardTitle>
              <CardDescription>
                Basic details about your school
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="schoolName" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  School Name
                </label>
                <Input
                  id="schoolName"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g., St. Mary's College"
                  required
                />
              </div>
              <div>
                <label htmlFor="address" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Address
                </label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g., Colombo 07, Sri Lanka"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Timetable Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Timetable Configuration</CardTitle>
              <CardDescription>
                Define your school&apos;s daily schedule structure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="startTime" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Start Time
                  </label>
                  <Input
                    id="startTime"
                    type="time"
                    value={config.startTime}
                    onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="periodDuration" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Period Duration (minutes)
                  </label>
                  <Input
                    id="periodDuration"
                    type="number"
                    min="30"
                    max="90"
                    value={config.periodDuration}
                    onChange={(e) => setConfig({ ...config, periodDuration: parseInt(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="numberOfPeriods" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Number of Periods
                  </label>
                  <Input
                    id="numberOfPeriods"
                    type="number"
                    min="5"
                    max="10"
                    value={config.numberOfPeriods}
                    onChange={(e) => setConfig({ ...config, numberOfPeriods: parseInt(e.target.value) })}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interval Slots */}
          <Card>
            <CardHeader>
              <CardTitle>Interval Slots</CardTitle>
              <CardDescription>
                Define breaks between periods (e.g., after period 2, 15-minute break)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.intervalSlots.map((slot, index) => (
                <div key={index} className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      After Period
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max={config.numberOfPeriods - 1}
                      value={slot.afterPeriod}
                      onChange={(e) => updateIntervalSlot(index, 'afterPeriod', parseInt(e.target.value))}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Duration (minutes)
                    </label>
                    <Input
                      type="number"
                      min="5"
                      max="60"
                      value={slot.duration}
                      onChange={(e) => updateIntervalSlot(index, 'duration', parseInt(e.target.value))}
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => removeIntervalSlot(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addIntervalSlot}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Interval Slot
              </Button>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={loading} size="lg">
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
