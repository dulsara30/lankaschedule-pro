'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Sparkles, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { generateTimetableAction } from '@/app/actions/generateTimetable';

interface Subject {
  _id: string;
  name: string;
  color: string;
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
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [formData, setFormData] = useState({
    lessonName: '',
    numberOfSingles: 0,
    numberOfDoubles: 0,
    notes: '',
  });

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [subjectSearchTerm, setSubjectSearchTerm] = useState('');
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

  // Smart lesson naming: Auto-fill if single subject selected
  useEffect(() => {
    if (selectedSubjects.length === 1 && !editingLesson) {
      const subject = subjects.find(s => s._id === selectedSubjects[0]);
      if (subject) {
        setFormData(prev => ({ ...prev, lessonName: subject.name }));
      }
    } else if (selectedSubjects.length > 1 && formData.lessonName && subjects.find(s => s.name === formData.lessonName)) {
      // Clear auto-filled name when multiple subjects selected
      setFormData(prev => ({ ...prev, lessonName: '' }));
    }
  }, [selectedSubjects, subjects, editingLesson]);

  useEffect(() => {
    fetchData();

    const handleFocus = () => {
      router.refresh();
      fetchData();
    };

    window.addEventListener('focus', handleFocus);
    
    const interval = setInterval(() => {
      fetchData();
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [router]);

  const fetchData = async () => {
    try {
      const [lessonsRes, subjectsRes, teachersRes, classesRes] = await Promise.all([
        fetch('/api/lessons', { cache: 'no-store' }),
        fetch('/api/subjects', { cache: 'no-store' }),
        fetch('/api/teachers', { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' }),
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

    if (selectedSubjects.length === 0 || selectedTeachers.length === 0) {
      toast.error('Please select at least one subject and one teacher');
      return;
    }

    if (formData.numberOfSingles === 0 && formData.numberOfDoubles === 0) {
      toast.error('Please specify at least one single or double period');
      return;
    }

    // Validation: Check total periods
    const totalPeriods = formData.numberOfSingles + (formData.numberOfDoubles * 2);
    if (totalPeriods > 35) {
      toast.error(`Total periods (${totalPeriods}) exceeds weekly maximum of 35`);
      return;
    }

    try {
      const url = '/api/lessons';
      const method = editingLesson ? 'PUT' : 'POST';

      const body = editingLesson
        ? { id: editingLesson._id, ...formData, subjectIds: selectedSubjects, teacherIds: selectedTeachers, classIds: selectedClasses }
        : { ...formData, subjectIds: selectedSubjects, teacherIds: selectedTeachers, classIds: selectedClasses };

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
        router.refresh();
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
      notes: lesson.notes || '',
    });
    setSelectedClasses(lesson.classIds.map(c => c._id));
    setSelectedSubjects(lesson.subjectIds.map(s => s._id));
    setSelectedTeachers(lesson.teacherIds.map(t => t._id));
    
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
        router.refresh();
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

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers(prev =>
      prev.includes(teacherId)
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const resetForm = () => {
    setFormData({
      lessonName: '',
      numberOfSingles: 0,
      numberOfDoubles: 0,
      notes: '',
    });
    setSelectedClasses([]);
    setSelectedSubjects([]);
    setSelectedTeachers([]);
    setSubjectSearchTerm('');
    setTeacherSearchTerm('');
    setEditingLesson(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const handleGenerateTimetable = async () => {
    if (lessons.length === 0) {
      toast.error('No lessons found. Please create lessons first.');
      return;
    }

    setIsGenerating(true);
    toast.info('Starting AI timetable generation...');

    try {
      const result = await generateTimetableAction();

      if (result.success) {
        toast.success(result.message);
        
        if (result.stats) {
          toast.info(
            `Stats: ${result.stats.totalSlots} slots, ${result.stats.scheduledLessons} lessons, ${result.stats.recursions} iterations`,
            { duration: 5000 }
          );
        }

        if (result.failedLessons && result.failedLessons.length > 0) {
          toast.warning(
            `Failed to schedule: ${result.failedLessons.map(f => f.lessonName).join(', ')}`,
            { duration: 8000 }
          );
        }

        router.push('/dashboard/timetable');
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const totalPeriods = formData.numberOfSingles + (formData.numberOfDoubles * 2);

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
        <div className="flex gap-3">
          <Button
            onClick={handleGenerateTimetable}
            disabled={isGenerating || lessons.length === 0}
            variant="outline"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 border-0"
          >
            {isGenerating ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Timetable
              </>
            )}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Lesson
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {editingLesson ? 'Edit Lesson' : 'Create New Lesson'}
                </DialogTitle>
                <DialogDescription className="text-sm text-zinc-600 dark:text-zinc-400">
                  Build a comprehensive lesson unit with subjects, teachers, and classes in a professional horizontal layout
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-6 mt-6">
                {/* Row 1: Three Large Selection Cards */}
                <div className="grid grid-cols-3 gap-6">
                  {/* Classes Card */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Card className="h-[140px] flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition-all border-2 hover:border-blue-500 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-zinc-900">
                        <CardContent className="flex flex-col items-center justify-center p-6 w-full">
                          <div className="text-5xl mb-3">📚</div>
                          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">Select Classes</h3>
                          {selectedClasses.length > 0 && (
                            <p className="text-sm text-blue-600 font-semibold mt-2">{selectedClasses.length} selected</p>
                          )}
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Select Classes</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-4">
                        {classes.map((classItem) => (
                          <button
                            key={classItem._id}
                            type="button"
                            onClick={() => toggleClass(classItem._id)}
                            className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                              selectedClasses.includes(classItem._id)
                                ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-50'
                                : 'border-zinc-300 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900'
                            }`}
                          >
                            {classItem.name}
                          </button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Subjects Card */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Card className="h-[140px] flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition-all border-2 hover:border-pink-500 bg-gradient-to-br from-pink-50 to-white dark:from-pink-950 dark:to-zinc-900">
                        <CardContent className="flex flex-col items-center justify-center p-6 w-full">
                          <div className="text-5xl mb-3">🎨</div>
                          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">Select Subjects</h3>
                          {selectedSubjects.length > 0 && (
                            <p className="text-sm text-pink-600 font-semibold mt-2">{selectedSubjects.length} selected</p>
                          )}
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Select Subjects</DialogTitle>
                      </DialogHeader>
                      <div className="mb-3">
                        <Input
                          type="text"
                          placeholder="🔍 Search subjects..."
                          value={subjectSearchTerm}
                          onChange={(e) => setSubjectSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto p-4">
                        {subjects
                          .filter(subject => 
                            subject.name.toLowerCase().includes(subjectSearchTerm.toLowerCase())
                          )
                          .map((subject) => (
                          <button
                            key={subject._id}
                            type="button"
                            onClick={() => toggleSubject(subject._id)}
                            className={`w-full flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all text-left ${
                              selectedSubjects.includes(subject._id)
                                ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-50'
                                : 'border-zinc-300 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900'
                            }`}
                          >
                            <div 
                              className="h-5 w-5 rounded-full flex-shrink-0 border-2 border-white shadow-sm" 
                              style={{ backgroundColor: subject.color }}
                            />
                            <span className="truncate flex-1">{subject.name}</span>
                          </button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Teachers Card */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Card className="h-[140px] flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition-all border-2 hover:border-purple-500 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950 dark:to-zinc-900">
                        <CardContent className="flex flex-col items-center justify-center p-6 w-full">
                          <div className="text-5xl mb-3">👨‍🏫</div>
                          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">Select Teachers</h3>
                          {selectedTeachers.length > 0 && (
                            <p className="text-sm text-purple-600 font-semibold mt-2">{selectedTeachers.length} selected</p>
                          )}
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Select Teachers</DialogTitle>
                      </DialogHeader>
                      <div className="mb-3">
                        <Input
                          type="text"
                          placeholder="🔍 Search teachers..."
                          value={teacherSearchTerm}
                          onChange={(e) => setTeacherSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto p-4">
                        {teachers
                          .filter(teacher => 
                            teacher.name.toLowerCase().includes(teacherSearchTerm.toLowerCase())
                          )
                          .map((teacher) => (
                          <button
                            key={teacher._id}
                            type="button"
                            onClick={() => toggleTeacher(teacher._id)}
                            className={`w-full rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all text-left ${
                              selectedTeachers.includes(teacher._id)
                                ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-50'
                                : 'border-zinc-300 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900'
                            }`}
                          >
                            <div className="truncate">{teacher.name}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{teacher.email}</div>
                          </button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Row 2: Lesson Name */}
                <div>
                  <label htmlFor="lessonName" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Lesson Name <span className="text-zinc-500 text-xs">(Select subjects first)</span>
                  </label>
                  <Input
                    id="lessonName"
                    value={formData.lessonName}
                    onChange={(e) => setFormData({ ...formData, lessonName: e.target.value })}
                    placeholder="e.g., Grade 6 Aesthetic Block, 10-Science Combined"
                    required={selectedSubjects.length !== 1}
                    className="text-base h-11"
                  />
                </div>

                {/* Row 3: Periods Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="numberOfSingles" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      ⏱️ Single Periods/Week
                    </label>
                    <Input
                      id="numberOfSingles"
                      type="number"
                      min="0"
                      max="35"
                      value={formData.numberOfSingles}
                      onChange={(e) => setFormData({ ...formData, numberOfSingles: parseInt(e.target.value) || 0 })}
                      className="text-base h-11"
                    />
                  </div>
                  <div>
                    <label htmlFor="numberOfDoubles" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      ⏰ Double Periods/Week
                    </label>
                    <Input
                      id="numberOfDoubles"
                      type="number"
                      min="0"
                      max="17"
                      value={formData.numberOfDoubles}
                      onChange={(e) => setFormData({ ...formData, numberOfDoubles: parseInt(e.target.value) || 0 })}
                      className="text-base h-11"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      📊 Total Periods
                    </label>
                    <div className={`h-11 rounded-md px-4 flex items-center justify-center gap-2 border-2 font-semibold ${
                      totalPeriods > 35 
                        ? 'border-red-500 bg-red-50 text-red-700' 
                        : 'border-zinc-300 bg-zinc-50 text-zinc-700'
                    }`}>
                      {totalPeriods} / 35 max
                    </div>
                  </div>
                </div>

                {/* Row 4: Notes */}
                <div>
                  <label htmlFor="notes" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    📝 Notes (Optional)
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional information about this lesson..."
                    rows={2}
                    className="flex w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} className="h-10 px-6">
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={totalPeriods > 35}
                    className="h-10 px-8 bg-blue-600 hover:bg-blue-700"
                  >
                    {editingLesson ? 'Update Lesson' : 'Create Lesson'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Lessons</CardTitle>
          <CardDescription>
            {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Lesson Name</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead className="text-center">Periods/Week</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lessons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                      No lessons created yet. Click "Create Lesson" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  lessons.map((lesson) => {
                    const totalPeriods = lesson.numberOfSingles + (lesson.numberOfDoubles * 2);
                    return (
                      <TableRow key={lesson._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <TableCell>
                          {/* Rainbow Stripe */}
                          <div className="flex gap-0.5">
                            {lesson.subjectIds.slice(0, 4).map((subject, idx) => {
                              const subjectData = subjects.find(s => s._id === subject._id);
                              return (
                                <div
                                  key={idx}
                                  className="w-1.5 h-10 rounded-full"
                                  style={{ backgroundColor: subjectData?.color || '#3B82F6' }}
                                  title={subject.name}
                                />
                              );
                            })}
                            {lesson.subjectIds.length > 4 && (
                              <div className="w-1.5 h-10 rounded-full bg-zinc-300 dark:bg-zinc-700" title={`+${lesson.subjectIds.length - 4} more`} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                              {lesson.lessonName}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {lesson.subjectIds.map((subject) => (
                                <Badge key={subject._id} variant="secondary" className="text-xs">
                                  {subject.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {lesson.classIds.map((cls) => (
                              <Badge key={cls._id} variant="outline" className="text-xs">
                                {cls.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-zinc-600 dark:text-zinc-400">
                            {lesson.teacherIds.map(t => t.name).join(', ')}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{totalPeriods}</span>
                            <span className="text-xs text-zinc-500">
                              {lesson.numberOfSingles}S + {lesson.numberOfDoubles}D
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(lesson)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(lesson._id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
