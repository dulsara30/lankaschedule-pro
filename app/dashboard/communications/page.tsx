'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Edit, XCircle, Send, MessageSquare } from 'lucide-react';

interface TimetableVersion {
  _id: string;
  versionName: string;
  isPublished: boolean;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export default function CommunicationsPage() {
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    fetchPublishedVersions();
  }, []);

  const fetchPublishedVersions = async () => {
    try {
      const response = await fetch('/api/timetable/versions');
      const data = await response.json();
      
      if (data.success) {
        // Filter only published versions
        const published = data.versions.filter((v: TimetableVersion) => v.isPublished);
        setVersions(published);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Failed to load published timetables');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateNote = async (versionId: string, newNote: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/timetable/versions/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, adminNote: newNote }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Note updated successfully');
        fetchPublishedVersions();
        setEditingVersion(null);
        setEditNote('');
      } else {
        toast.error(data.error || 'Failed to update note');
      }
    } catch (error) {
      console.error('Error updating note:', error);
      toast.error('Failed to update note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnpublish = async (versionId: string, versionName: string) => {
    if (!confirm(`Are you sure you want to unpublish "${versionName}"?`)) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/timetable/versions/publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Timetable unpublished');
        fetchPublishedVersions();
      } else {
        toast.error(data.error || 'Failed to unpublish');
      }
    } catch (error) {
      console.error('Error unpublishing:', error);
      toast.error('Failed to unpublish timetable');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGlobalAnnouncement = async () => {
    if (!globalAnnouncement.trim()) {
      toast.error('Please enter an announcement');
      return;
    }

    toast.info('Global announcements feature coming soon');
    // TODO: Implement global announcement storage and delivery
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Communications Center</h1>
        <p className="text-zinc-600 mt-2">
          Manage staff communications and timetable announcements
        </p>
      </div>

      {/* Global Announcement */}
      <Card className="border-2 border-black">
        <CardHeader className="border-b-2 border-black">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Global Staff Announcement
          </CardTitle>
          <CardDescription>
            Send an announcement to all staff members (not tied to a specific timetable)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <Input
            placeholder="Type your announcement here..."
            value={globalAnnouncement}
            onChange={(e) => setGlobalAnnouncement(e.target.value)}
            className="border-2 border-black rounded-none"
          />
          <Button
            onClick={handleGlobalAnnouncement}
            className="bg-black hover:bg-zinc-800 rounded-none"
          >
            <Send className="mr-2 h-4 w-4" />
            Send Announcement
          </Button>
        </CardContent>
      </Card>

      {/* Published Timetables */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Published Timetables</h2>
        {versions.length === 0 ? (
          <Card className="border-2 border-black">
            <CardContent className="pt-6 text-center text-zinc-500">
              No published timetables. Publish a timetable from the Timetable page.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {versions.map((version) => (
              <Card key={version._id} className="border-2 border-black">
                <CardHeader className="border-b-2 border-black">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{version.versionName}</CardTitle>
                      <CardDescription>
                        Published on {new Date(version.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-2 border-black rounded-none"
                            onClick={() => {
                              setEditingVersion(version._id);
                              setEditNote(version.adminNote || '');
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Note
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="border-2 border-black rounded-none">
                          <DialogHeader>
                            <DialogTitle>Edit Admin Note</DialogTitle>
                            <DialogDescription>
                              This message will be visible to staff viewing this timetable
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Input
                              placeholder="Enter your note (max 500 characters)"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              maxLength={500}
                              className="border-2 border-black rounded-none"
                            />
                            <p className="text-sm text-zinc-500">
                              {editNote.length}/500 characters
                            </p>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleUpdateNote(version._id, editNote)}
                                disabled={isSaving}
                                className="bg-black hover:bg-zinc-800 rounded-none"
                              >
                                {isSaving ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  'Save'
                                )}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnpublish(version._id, version.versionName)}
                        disabled={isSaving}
                        className="border-2 border-red-600 text-red-600 hover:bg-red-50 rounded-none"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Unpublish
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {version.adminNote && (
                  <CardContent className="pt-6">
                    <div className="bg-zinc-50 border-2 border-black p-4">
                      <p className="text-sm font-bold uppercase tracking-wide mb-2">
                        Admin Note:
                      </p>
                      <p className="text-sm">{version.adminNote}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
