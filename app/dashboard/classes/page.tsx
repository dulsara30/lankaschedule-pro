'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Class {
  _id: string;
  name: string;
  grade: number;
  is13YearProgram: boolean;
  stream?: string;
}

const STREAMS = ['Bio', 'Maths', 'Arts', 'Commerce', 'Technology', 'Vocational'] as const;

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState({
    grade: 6,
    is13YearProgram: false,
    stream: '',
    numberOfParallelClasses: 1,
    customPrefix: '',
  });

  // Generate class names in real-time
  const generatedClassNames = useMemo(() => {
    const count = formData.numberOfParallelClasses;
    if (count < 0 || count > 26) return [];
    
    // If count is 0 or 1, no suffix - just "Grade 6"
    if (count <= 1) {
      let name = `Grade ${formData.grade}`;
      if (formData.stream) {
        name = `Grade ${formData.grade} - ${formData.stream}`;
      }
      if (formData.customPrefix) {
        name = formData.customPrefix;
      }
      return [name];
    }
    
    // For count > 1, add suffixes A, B, C, etc.
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const names: string[] = [];
    
    for (let i = 0; i < count; i++) {
      let name = `${formData.grade}-${letters[i]}`;
      if (formData.stream) {
        name = `${formData.grade}-${formData.stream}-${letters[i]}`;
      }
      if (formData.customPrefix) {
        name = `${formData.customPrefix}-${letters[i]}`;
      }
      names.push(name);
    }
    
    return names;
  }, [formData.grade, formData.stream, formData.numberOfParallelClasses, formData.customPrefix]);

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
      
      // When editing, update single class
      if (editingClass) {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingClass._id,
            name: generatedClassNames[0], // Use first generated name for single edit
            grade: formData.grade,
            is13YearProgram: formData.is13YearProgram,
            stream: formData.stream || undefined,
          }),
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
        return;
      }

      // When creating, create multiple parallel classes
      const classesToCreate = generatedClassNames.map(name => ({
        name,
        grade: formData.grade,
        is13YearProgram: formData.is13YearProgram,
        stream: formData.stream || undefined,
      }));

      // Create all classes
      const results = await Promise.all(
        classesToCreate.map(classData =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(classData),
          }).then(res => res.json())
        )
      );

      const failed = results.filter(r => !r.success);
      const succeeded = results.filter(r => r.success);

      if (succeeded.length > 0) {
        toast.success(`Successfully created ${succeeded.length} class${succeeded.length > 1 ? 'es' : ''}`);
      }
      if (failed.length > 0) {
        toast.error(`Failed to create ${failed.length} class${failed.length > 1 ? 'es' : ''}`);
      }

      setDialogOpen(false);
      resetForm();
      fetchClasses();
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem);
    setFormData({
      grade: classItem.grade,
      is13YearProgram: classItem.is13YearProgram,
      stream: classItem.stream || '',
      numberOfParallelClasses: 1,
      customPrefix: classItem.name.split('-')[0] + '-' + (classItem.stream || ''),
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
    setFormData({ 
      grade: 6, 
      is13YearProgram: false, 
      stream: '',
      numberOfParallelClasses: 1,
      customPrefix: '',
    });
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
                <label htmlFor="grade" className="mb-2 block text-sm font-medium">
                  Grade
                </label>
                <select
                  id="grade"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                  required
                >
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((grade) => (
                    <option key={grade} value={grade}>
                      Grade {grade}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={formData.is13YearProgram}
                    onChange={(e) => setFormData({ ...formData, is13YearProgram: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  13 Years Guaranteed Education
                </label>
                <p className="mt-1 text-xs text-zinc-500">
                  Check if this class is part of the 13-year program
                </p>
              </div>

              {formData.grade >= 10 && (
                <div>
                  <label htmlFor="stream" className="mb-2 block text-sm font-medium">
                    Stream (for Grades 10-13)
                  </label>
                  <select
                    id="stream"
                    value={formData.stream}
                    onChange={(e) => setFormData({ ...formData, stream: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                  >
                    <option value="">No Stream</option>
                    {STREAMS.map((stream) => (
                      <option key={stream} value={stream}>
                        {stream}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Select applicable stream for grades 10-13 (Bio, Maths, Arts, Commerce, Tech, Vocational)
                  </p>
                </div>
              )}

              {!editingClass && (
                <>
                  <div>
                    <label htmlFor="numberOfParallelClasses" className="mb-2 block text-sm font-medium">
                      Number of Parallel Classes
                    </label>
                    <Input
                      id="numberOfParallelClasses"
                      type="number"
                      min="0"
                      max="26"
                      value={formData.numberOfParallelClasses}
                      onChange={(e) => setFormData({ ...formData, numberOfParallelClasses: parseInt(e.target.value) || 0 })}
                      required
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Enter 0 or 1 for a single class (no suffix). Enter 2+ to auto-generate with suffixes A, B, C, etc.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="customPrefix" className="mb-2 block text-sm font-medium">
                      Custom Prefix (Optional)
                    </label>
                    <Input
                      id="customPrefix"
                      value={formData.customPrefix}
                      onChange={(e) => setFormData({ ...formData, customPrefix: e.target.value })}
                      placeholder="e.g., 6-Colombo (leave empty for default)"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Override default naming. Default format: Grade-Letter or Grade-Stream-Letter
                    </p>
                  </div>

                  {/* Real-time Preview */}
                  {generatedClassNames.length > 0 && (
                    <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                      <div className="flex items-start gap-2">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div>
                          <div className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                            Classes to be created ({generatedClassNames.length}):
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {generatedClassNames.map((name, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingClass ? 'Update' : `Create ${generatedClassNames.length} Class${generatedClassNames.length > 1 ? 'es' : ''}`}
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
                  <TableHead>Program</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classItem) => (
                  <TableRow key={classItem._id}>
                    <TableCell className="font-medium">{classItem.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getGradeBadgeColor(classItem.grade)}`}>
                        Grade {classItem.grade}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {classItem.is13YearProgram ? '13-Year' : '12-Year'}
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
