'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Class {
  _id: string;
  name: string;
  gradeLevel: number;
  stream?: string;
}

const STREAMS = ['', 'Science', 'Arts', 'Commerce', 'Technology'] as const;

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    gradeLevel: 6,
    stream: '',
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const response = await fetch('/api/classes');
      const data = await response.json();
      if (data.success) {
        setClasses(data.data);
      }
    } catch (error) {
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = '/api/classes';
      const method = editingClass ? 'PUT' : 'POST';
      const body = editingClass
        ? { id: editingClass._id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setDialogOpen(false);
        resetForm();
        fetchClasses();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem);
    setFormData({
      name: classItem.name,
      gradeLevel: classItem.gradeLevel,
      stream: classItem.stream || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
      const response = await fetch(`/api/classes?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Class deleted successfully');
        fetchClasses();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Failed to delete class');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', gradeLevel: 6, stream: '' });
    setEditingClass(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const getGradeBadgeColor = (grade: number) => {
    if (grade <= 5) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (grade <= 9) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (grade <= 11) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Classes
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage classes and grade levels
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingClass ? 'Edit Class' : 'Add New Class'}
              </DialogTitle>
              <DialogDescription>
                {editingClass
                  ? 'Update the class details below'
                  : 'Enter the details for the new class'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium">
                  Class Name
                </label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., 6-A, 12-Maths-Olu"
                  required
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Examples: 6-A, 6-B, 10-Science, 12-Arts-Colombo
                </p>
              </div>
              <div>
                <label htmlFor="gradeLevel" className="mb-2 block text-sm font-medium">
                  Grade Level
                </label>
                <Input
                  id="gradeLevel"
                  type="number"
                  min="1"
                  max="13"
                  value={formData.gradeLevel}
                  onChange={(e) => setFormData({ ...formData, gradeLevel: parseInt(e.target.value) })}
                  required
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Grade 1-13 for Sri Lankan schools
                </p>
              </div>
              <div>
                <label htmlFor="stream" className="mb-2 block text-sm font-medium">
                  Stream (Optional)
                </label>
                <select
                  id="stream"
                  value={formData.stream}
                  onChange={(e) => setFormData({ ...formData, stream: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                >
                  <option value="">No Stream</option>
                  {STREAMS.slice(1).map((stream) => (
                    <option key={stream} value={stream}>
                      {stream}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  For higher grades (10-13), select applicable stream
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingClass ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Classes</CardTitle>
          <CardDescription>
            {classes.length} class{classes.length !== 1 ? 'es' : ''} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Loading...</div>
          ) : classes.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              No classes found. Add your first class to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Grade Level</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classItem) => (
                  <TableRow key={classItem._id}>
                    <TableCell className="font-medium">{classItem.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getGradeBadgeColor(classItem.gradeLevel)}`}>
                        Grade {classItem.gradeLevel}
                      </span>
                    </TableCell>
                    <TableCell>
                      {classItem.stream ? (
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {classItem.stream}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(classItem)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(classItem._id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
