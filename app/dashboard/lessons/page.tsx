'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Subject {
  _id: string;
  name: string;
}

interface Teacher {
  _id: string;
  name: string;
  email: string;
}

interface Class {
  _id: string;
  name: string;
  grade: number;
}

interface SubjectTeacherPair {
  subjectId: string;
  teacherId: string;
  subjectName?: string;
  teacherName?: string;
}

interface Lesson {
  _id: string;
  lessonName: string;
  subjectIds: Array<{ _id: string; name: string }>;
  teacherIds: Array<{ _id: string; name: string; email: string }>;
  classIds: Array<{ _id: string; name: string; grade: number }>;
  numberOfSingles: number;
  numberOfDoubles: number;
  color?: string;
  notes?: string;
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const [formData, setFormData] = useState({
    lessonName: '',
    numberOfSingles: 0,
    numberOfDoubles: 0,
    color: '#3B82F6',
    notes: '',
  });

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [subjectTeacherPairs, setSubjectTeacherPairs] = useState<SubjectTeacherPair[]>([]);
  const [currentSubject, setCurrentSubject] = useState('');
  const [currentTeacher, setCurrentTeacher] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [lessonsRes, subjectsRes, teachersRes, classesRes] = await Promise.all([
        fetch('/api/lessons'),
        fetch('/api/subjects'),
        fetch('/api/teachers'),
        fetch('/api/classes'),
      ]);

      const [lessonsData, subjectsData, teachersData, classesData] = await Promise.all([
        lessonsRes.json(),
        subjectsRes.json(),
        teachersRes.json(),
        classesRes.json(),
      ]);

      if (lessonsData.success) setLessons(lessonsData.data);
      if (subjectsData.success) setSubjects(subjectsData.data);
      if (teachersData.success) setTeachers(teachersData.data);
      if (classesData.success) setClasses(classesData.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedClasses.length === 0) {
      toast.error('Please select at least one class');
      return;
    }

    if (subjectTeacherPairs.length === 0) {
      toast.error('Please add at least one subject-teacher pair');
      return;
    }

    try {
      const url = '/api/lessons';
      const method = editingLesson ? 'PUT' : 'POST';
      
      const subjectIds = subjectTeacherPairs.map(pair => pair.subjectId);
      const teacherIds = subjectTeacherPairs.map(pair => pair.teacherId);

      const body = editingLesson
        ? { id: editingLesson._id, ...formData, subjectIds, teacherIds, classIds: selectedClasses }
        : { ...formData, subjectIds, teacherIds, classIds: selectedClasses };

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
        fetchData();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setFormData({
      lessonName: lesson.lessonName,
      numberOfSingles: lesson.numberOfSingles,
      numberOfDoubles: lesson.numberOfDoubles,
      color: lesson.color || '#3B82F6',
      notes: lesson.notes || '',
    });
    setSelectedClasses(lesson.classIds.map(c => c._id));
    
    // Reconstruct subject-teacher pairs
    const pairs = lesson.subjectIds.map((subject, index) => ({
      subjectId: subject._id,
      teacherId: lesson.teacherIds[index]?._id || '',
      subjectName: subject.name,
      teacherName: lesson.teacherIds[index]?.name || '',
    }));
    setSubjectTeacherPairs(pairs);
    
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;

    try {
      const response = await fetch(`/api/lessons?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Lesson deleted successfully');
        fetchData();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Failed to delete lesson');
    }
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  const addSubjectTeacherPair = () => {
    if (!currentSubject || !currentTeacher) {
      toast.error('Please select both a subject and a teacher');
      return;
    }

    // Check if subject already exists
    if (subjectTeacherPairs.some(pair => pair.subjectId === currentSubject)) {
      toast.error('This subject has already been added');
      return;
    }

    const subject = subjects.find(s => s._id === currentSubject);
    const teacher = teachers.find(t => t._id === currentTeacher);

    setSubjectTeacherPairs([
      ...subjectTeacherPairs,
      {
        subjectId: currentSubject,
        teacherId: currentTeacher,
        subjectName: subject?.name,
        teacherName: teacher?.name,
      },
    ]);

    setCurrentSubject('');
    setCurrentTeacher('');
  };

  const removeSubjectTeacherPair = (index: number) => {
    setSubjectTeacherPairs(pairs => pairs.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormData({
      lessonName: '',
      numberOfSingles: 0,
      numberOfDoubles: 0,
      color: '#3B82F6',
      notes: '',
    });
    setSelectedClasses([]);
    setSubjectTeacherPairs([]);
    setCurrentSubject('');
    setCurrentTeacher('');
    setEditingLesson(null);
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
            Lesson Builder
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Create lesson units with multiple subjects, teachers, and parallel classes
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingLesson ? 'Edit Lesson' : 'Create New Lesson'}
              </DialogTitle>
              <DialogDescription>
                Build a lesson unit that can include multiple subjects, teachers, and parallel classes
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Lesson Name */}
              <div>
                <label htmlFor="lessonName" className="mb-2 block text-sm font-medium">
                  Lesson Name
                </label>
                <Input
                  id="lessonName"
                  value={formData.lessonName}
                  onChange={(e) => setFormData({ ...formData, lessonName: e.target.value })}
                  placeholder="e.g., Grade 6 Aesthetic Block, 10-Maths"
                  required
                />
              </div>

              {/* Class Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Select Classes (Parallel Classes)
                </label>
                <Card className="p-4">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {classes.map((classItem) => (
                      <button
                        key={classItem._id}
                        type="button"
                        onClick={() => toggleClass(classItem._id)}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                          selectedClasses.includes(classItem._id)
                            ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-50'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900'
                        }`}
                      >
                        {classItem.name}
                        <span className="ml-1 text-xs text-zinc-500">
                          (Grade {classItem.grade})
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectedClasses.length > 0 && (
                    <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                    </div>
                  )}
                </Card>
              </div>

              {/* Subject-Teacher Pairs */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Assign Subjects and Teachers
                </label>
                <Card className="p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
                    <div>
                      <label htmlFor="subject" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Subject
                      </label>
                      <select
                        id="subject"
                        value={currentSubject}
                        onChange={(e) => setCurrentSubject(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <option value="">Select Subject</option>
                        {subjects.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="teacher" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Teacher
                      </label>
                      <select
                        id="teacher"
                        value={currentTeacher}
                        onChange={(e) => setCurrentTeacher(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map((teacher) => (
                          <option key={teacher._id} value={teacher._id}>
                            {teacher.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={addSubjectTeacherPair} className="w-full md:w-auto">
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Display added pairs */}
                  {subjectTeacherPairs.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Subject-Teacher Assignments:
                      </div>
                      {subjectTeacherPairs.map((pair, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-zinc-900 dark:text-zinc-50">
                              {pair.subjectName}
                            </span>
                            <span className="text-zinc-400">→</span>
                            <span className="text-zinc-600 dark:text-zinc-300">
                              {pair.teacherName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSubjectTeacherPair(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Periods and Settings */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="numberOfSingles" className="mb-2 block text-sm font-medium">
                    Single Periods
                  </label>
                  <Input
                    id="numberOfSingles"
                    type="number"
                    min="0"
                    max="35"
                    value={formData.numberOfSingles}
                    onChange={(e) => setFormData({ ...formData, numberOfSingles: parseInt(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Number of single periods per week
                  </p>
                </div>
                <div>
                  <label htmlFor="numberOfDoubles" className="mb-2 block text-sm font-medium">
                    Double Periods
                  </label>
                  <Input
                    id="numberOfDoubles"
                    type="number"
                    min="0"
                    max="17"
                    value={formData.numberOfDoubles}
                    onChange={(e) => setFormData({ ...formData, numberOfDoubles: parseInt(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Number of double periods per week
                  </p>
                </div>
                <div>
                  <label htmlFor="color" className="mb-2 block text-sm font-medium">
                    Color (Optional)
                  </label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-medium">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this lesson..."
                  rows={3}
                  className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingLesson ? 'Update Lesson' : 'Create Lesson'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Lessons</CardTitle>
          <CardDescription>
            {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Loading...</div>
          ) : lessons.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              No lessons found. Create your first lesson to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lesson Name</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Periods/Week</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lessons.map((lesson) => (
                  <TableRow key={lesson._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: lesson.color }}
                        />
                        <span className="font-medium">{lesson.lessonName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {lesson.subjectIds.map((subject) => (
                          <span
                            key={subject._id}
                            className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {subject.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        {lesson.teacherIds.map((teacher) => teacher.name).join(', ')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {lesson.classIds.map((classItem) => (
                          <span
                            key={classItem._id}
                            className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
                          >
                            {classItem.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-sm">
                        {lesson.numberOfSingles > 0 && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {lesson.numberOfSingles} Single{lesson.numberOfSingles > 1 ? 's' : ''}
                          </span>
                        )}
                        {lesson.numberOfDoubles > 0 && (
                          <span className="rounded bg-purple-100 px-2 py-0.5 font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            {lesson.numberOfDoubles} Double{lesson.numberOfDoubles > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(lesson)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(lesson._id)}
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
