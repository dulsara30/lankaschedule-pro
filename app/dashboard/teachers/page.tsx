'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Teacher {
  _id: string;
  name: string;
  email: string;
  subjectsTaught: string[];
}

interface Subject {
  _id: string;
  name: string;
}

const TEACHER_MIN_PERIODS = 24;
const TEACHER_MAX_PERIODS = 35;

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subjectsTaught: [] as string[],
  });

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  const fetchTeachers = async () => {
    try {
      const response = await fetch('/api/teachers', { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setTeachers(data.data);
      }
    } catch (error) {
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch('/api/subjects', { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setSubjects(data.data);
      }
    } catch (error) {
      console.error('Failed to load subjects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = '/api/teachers';
      const method = editingTeacher ? 'PUT' : 'POST';
      const body = editingTeacher
        ? { id: editingTeacher._id, ...formData }
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
        fetchTeachers();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email,
      subjectsTaught: teacher.subjectsTaught,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
      const response = await fetch(`/api/teachers?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Teacher deleted successfully');
        fetchTeachers();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Failed to delete teacher');
    }
  };

  const toggleSubject = (subjectName: string) => {
    setFormData(prev => ({
      ...prev,
      subjectsTaught: prev.subjectsTaught.includes(subjectName)
        ? prev.subjectsTaught.filter(s => s !== subjectName)
        : [...prev.subjectsTaught, subjectName]
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      subjectsTaught: [],
    });
    setEditingTeacher(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Teachers
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage teacher profiles and workload requirements
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Teacher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
              </DialogTitle>
              <DialogDescription>
                {editingTeacher
                  ? 'Update the teacher details below'
                  : 'Enter the details for the new teacher'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-medium">
                    Full Name
                  </label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Ms. Silva"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g., silva@school.lk"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subjects" className="mb-2 block text-sm font-medium">
                  Subjects Taught
                </label>
                {subjects.length === 0 ? (
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    No subjects available. Please add subjects first in the Subjects page.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    {subjects.map((subject) => (
                      <label
                        key={subject._id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md p-2 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.subjectsTaught.includes(subject.name)}
                          onChange={() => toggleSubject(subject.name)}
                          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm">{subject.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  Select one or more subjects this teacher can teach
                </p>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>💡 Workload Guideline:</strong> Teacher workload should ideally be between {TEACHER_MIN_PERIODS} and {TEACHER_MAX_PERIODS} periods per week for optimal scheduling.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingTeacher ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Teachers</CardTitle>
          <CardDescription>
            {teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Loading...</div>
          ) : teachers.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              No teachers found. Add your first teacher to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher._id}>
                    <TableCell className="font-medium">{teacher.name}</TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">{teacher.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {teacher.subjectsTaught.length > 0 ? (
                          teacher.subjectsTaught.map((subject) => (
                            <span
                              key={subject}
                              className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                            >
                              {subject}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-zinc-400">No subjects</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(teacher)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(teacher._id)}
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
