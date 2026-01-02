'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Pencil, Trash2, Search, X, Check, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getTeacherLessonsWithSlots, checkReassignmentConflicts, deleteAndReassignTeacherAction } from '@/app/actions/teacherActions';

interface LessonWithSlots {
  _id: string;
  lessonName: string;
  subjectIds: Array<{ _id: string; name: string }>;
  classIds: Array<{ _id: string; name: string }>;
  slots: Array<{
    _id: string;
    day: string;
    periodNumber: number;
  }>;
}

interface ConflictCheck {
  hasConflict: boolean;
  conflictingSlots: Array<{ day: string; periodNumber: number }>;
  currentWorkload: number;
  newWorkload: number;
  isOverCapacity: boolean;
}

interface LessonReassignment {
  lessonId: string;
  replacementTeacherId: string | null;
  conflictCheck?: ConflictCheck;
}

interface Teacher {
  _id: string;
  name: string;
  email?: string;
  teacherGrade: 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO';
  subjectsTaught: string[];
  lessonCount?: number;
  totalPeriods?: number;
}

interface Subject {
  _id: string;
  name: string;
  color: string;
}

const TEACHER_GRADES = ['SLTS 3 I', 'SLTS 2 II', 'SLTS 2 I', 'SLTS 1', 'DO'];
const ITEMS_PER_PAGE = 10;

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  // Smart deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [affectedLessons, setAffectedLessons] = useState<LessonWithSlots[]>([]);
  const [lessonReassignments, setLessonReassignments] = useState<LessonReassignment[]>([]);
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState(false);
  const [currentVersionId, setCurrentVersionId] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    teacherGrade: 'SLTS 3 I' as 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO',
  });
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
    fetchCurrentVersion();
  }, []);

  const fetchCurrentVersion = async () => {
    try {
      const response = await fetch('/api/timetable-versions');
      
      // Check if response is ok and content-type is JSON
      if (!response.ok) {
        console.error('Failed to fetch timetable versions:', response.statusText);
        return;
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Expected JSON response but got:', contentType);
        return;
      }
      
      const data = await response.json();
      if (data.success && data.data.length > 0) {
        // Get the most recent version
        const sortedVersions = data.data.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCurrentVersionId(sortedVersions[0]._id);
      }
    } catch (error) {
      console.error('Failed to fetch current version:', error);
    }
  };

  useEffect(() => {
    let filtered = teachers;

    if (searchQuery.trim()) {
      filtered = filtered.filter((teacher) => {
        const nameMatch = teacher.name.toLowerCase().includes(searchQuery.toLowerCase());
        const emailMatch = teacher.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const subjectMatch = teacher.subjectsTaught.some((subject) =>
          subject.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return nameMatch || emailMatch || subjectMatch;
      });
    }

    if (gradeFilter) {
      filtered = filtered.filter((teacher) => teacher.teacherGrade === gradeFilter);
    }

    setFilteredTeachers(filtered);
    setCurrentPage(1);
  }, [teachers, searchQuery, gradeFilter]);

  useEffect(() => {
    let filtered = subjects;

    if (subjectSearchQuery.trim()) {
      filtered = filtered.filter((subject) =>
        subject.name.toLowerCase().includes(subjectSearchQuery.toLowerCase())
      );
    }

    setFilteredSubjects(filtered);
  }, [subjects, subjectSearchQuery]);

  const fetchTeachers = async () => {
    try {
      const response = await fetch('/api/teachers');
      const data = await response.json();
      if (data.success) {
        setTeachers(data.data);
      }
    } catch {
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch('/api/subjects');
      const data = await response.json();
      if (data.success) {
        setSubjects(data.data);
      }
    } catch {
      toast.error('Failed to load subjects');
    }
  };

  const getPaginatedTeachers = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredTeachers.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredTeachers.length / ITEMS_PER_PAGE);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = '/api/teachers';
      const method = editingTeacher ? 'PUT' : 'POST';
      const body = editingTeacher
        ? { id: editingTeacher._id, ...formData, subjectsTaught: selectedSubjects }
        : { ...formData, subjectsTaught: selectedSubjects };

      // Debug logging
      console.log('Sending payload:', body);
      console.log('Method:', method);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setModalOpen(false);
        resetForm();
        fetchTeachers();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email || '',
      teacherGrade: teacher.teacherGrade,
    });
    setSelectedSubjects(teacher.subjectsTaught);
    setModalOpen(true);
  };

  const handleDelete = async (teacher: Teacher) => {
    // Open dialog and fetch detailed lesson information
    setTeacherToDelete(teacher);
    setDeleteDialogOpen(true);
    
    // Fetch all lessons with their timetable slots
    const lessons = await getTeacherLessonsWithSlots(teacher._id, currentVersionId);
    setAffectedLessons(lessons);
    
    // Initialize reassignment state for each lesson
    const initialReassignments = lessons.map(lesson => ({
      lessonId: lesson._id,
      replacementTeacherId: null,
      conflictCheck: undefined
    }));
    setLessonReassignments(initialReassignments);
  };

  const handleReplacementSelect = async (lessonIndex: number, teacherId: string | null) => {
    const lesson = affectedLessons[lessonIndex];
    if (!lesson) return;

    // Update reassignment
    const updatedReassignments = [...lessonReassignments];
    updatedReassignments[lessonIndex] = {
      ...updatedReassignments[lessonIndex],
      replacementTeacherId: teacherId
    };

    // If a teacher is selected, check for conflicts
    if (teacherId) {
      const conflictCheck = await checkReassignmentConflicts(
        teacherId,
        lesson.slots,
        currentVersionId
      );
      updatedReassignments[lessonIndex].conflictCheck = conflictCheck;
    } else {
      updatedReassignments[lessonIndex].conflictCheck = undefined;
    }

    setLessonReassignments(updatedReassignments);
    setOpenComboboxIndex(null);
  };

  const confirmDelete = async () => {
    if (!teacherToDelete) return;

    setDeletingTeacher(true);
    try {
      // Call the enhanced backend with transaction safety
      // Set shouldRegenerate to false by default (can be made configurable later)
      const result = await deleteAndReassignTeacherAction(
        teacherToDelete._id,
        lessonReassignments,
        false // shouldRegenerate parameter
      );

      if (result.success) {
        toast.success(result.message || 'Teacher deleted successfully');
        setDeleteDialogOpen(false);
        setTeacherToDelete(null);
        setAffectedLessons([]);
        setLessonReassignments([]);
        fetchTeachers();
      } else {
        toast.error(result.error || 'Failed to delete teacher');
      }
    } catch (error) {
      toast.error('Failed to delete teacher');
      console.error('Delete error:', error);
    } finally {
      setDeletingTeacher(false);
    }
  };

  const toggleSubject = (subjectName: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subjectName)
        ? prev.filter((s) => s !== subjectName)
        : [...prev, subjectName]
    );
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', teacherGrade: 'SLTS 3 I' });
    setSelectedSubjects([]);
    setEditingTeacher(null);
    setSubjectSearchQuery('');
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const getWorkloadColor = (periods: number) => {
    if (periods < 24) return 'text-yellow-600 bg-yellow-50';
    if (periods >= 24 && periods <= 35) return 'text-green-600 bg-green-50';
    return 'text-red-600 bg-red-50';
  };

  const getWorkloadBarColor = (periods: number) => {
    if (periods < 24) return 'bg-yellow-500';
    if (periods >= 24 && periods <= 35) return 'bg-green-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Teachers
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage your school teaching staff with grade classification
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Teacher
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Teachers</CardTitle>
              <CardDescription>
                {filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? 's' : ''}
                {searchQuery && ` matching "${searchQuery}"`}
                {gradeFilter && ` in grade "${gradeFilter}"`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Search by name, email, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">All Grades</option>
                {TEACHER_GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Loading...</div>
          ) : filteredTeachers.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              {searchQuery || gradeFilter
                ? 'No teachers found matching your filters'
                : 'No teachers found. Add your first teacher to get started.'}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Subjects Taught</TableHead>
                    <TableHead>Workload</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getPaginatedTeachers().map((teacher) => (
                    <TableRow key={teacher._id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell className="text-zinc-600">
                        {teacher.email || <span className="italic text-zinc-400">Not provided</span>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200">
                          {teacher.teacherGrade}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {teacher.subjectsTaught.length > 0 ? (
                            teacher.subjectsTaught.map((subject, idx) => {
                              const subjectData = subjects.find((s) => s.name === subject);
                              return (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                                  style={{
                                    backgroundColor: subjectData?.color ? `${subjectData.color}20` : '#e4e4e7',
                                    color: subjectData?.color || '#71717a',
                                    borderColor: subjectData?.color ? `${subjectData.color}40` : '#d4d4d8',
                                  }}
                                >
                                  {subject}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-zinc-400 italic">No subjects</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-md ${getWorkloadColor(
                              teacher.totalPeriods || 0
                            )}`}
                          >
                            {teacher.lessonCount || 0} lessons
                          </span>
                          <div className="flex-1 min-w-20">
                            <div className="relative h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className={`absolute top-0 left-0 h-full transition-all ${getWorkloadBarColor(
                                  teacher.totalPeriods || 0
                                )}`}
                                style={{
                                  width: `${Math.min((teacher.totalPeriods || 0) / 35, 1) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-zinc-500 mt-0.5 block">
                              {teacher.totalPeriods || 0}/35 periods
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(teacher)}
                            className="hover:bg-zinc-100"
                          >
                            <Pencil className="h-4 w-4 text-zinc-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(teacher)}
                            className="hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-zinc-600">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredTeachers.length)} of{' '}
                    {filteredTeachers.length} teachers
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-10"
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <span className="text-sm font-bold text-blue-700">ℹ</span>
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Workload Guideline</h3>
              <p className="mt-1 text-sm text-blue-700">
                Sri Lankan school teachers should handle{' '}
                <span className="font-bold">24-35 periods per week</span> for optimal
                performance. The system tracks this automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Ultra-Wide Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[95vw] max-w-400 h-[92vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-8 py-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {editingTeacher
                    ? 'Update teacher profile and subject assignments'
                    : 'Create a new teacher profile with grade and subjects'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeModal}
                className="hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-8 p-8 h-full">
                {/* Left Column - Profile */}
                <div className="space-y-6">
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                        <span className="text-white dark:text-zinc-900 text-sm font-bold">1</span>
                      </div>
                      Teacher Profile
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="name" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          Teacher Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., Mr. Perera"
                          required
                          className="h-12 text-base"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          Email <span className="text-zinc-400">(Optional)</span>
                        </label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="e.g., perera@school.lk"
                          className="h-12 text-base"
                        />
                      </div>

                      <div>
                        <label htmlFor="teacherGrade" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          Teacher Grade <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="teacherGrade"
                          value={formData.teacherGrade}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              teacherGrade: e.target.value as 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO',
                            })
                          }
                          required
                          className="w-full h-12 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                        >
                          {TEACHER_GRADES.map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-zinc-500">
                          Default: SLTS 3 I (Sri Lanka Teacher Service)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Selected Subjects Display */}
                  {selectedSubjects.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-4">
                      <p className="text-xs font-semibold text-green-900 dark:text-green-300 mb-2">
                        Selected Subjects ({selectedSubjects.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubjects.map((subjectName) => {
                          const subjectData = subjects.find((s) => s.name === subjectName);
                          return (
                            <button
                              key={subjectName}
                              type="button"
                              onClick={() => toggleSubject(subjectName)}
                              className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-all hover:scale-105"
                              style={{
                                backgroundColor: subjectData?.color ? `${subjectData.color}20` : '#e4e4e7',
                                color: subjectData?.color || '#71717a',
                                borderColor: subjectData?.color || '#d4d4d8',
                              }}
                            >
                              <div
                                className="h-4 w-4 rounded-sm shrink-0"
                                style={{ backgroundColor: subjectData?.color }}
                              />
                              <span>{subjectName}</span>
                              <X className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedSubjects.length === 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <span className="font-semibold">💡 Tip:</span> Select subjects from the list on the right →
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Column - Subjects */}
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                        <span className="text-white dark:text-zinc-900 text-sm font-bold">2</span>
                      </div>
                      Available Subjects
                    </h3>

                    {/* Subject Search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <Input
                        placeholder="Search subjects..."
                        value={subjectSearchQuery}
                        onChange={(e) => setSubjectSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    {/* Available Subjects List */}
                    <div className="max-h-[calc(92vh-360px)] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      {filteredSubjects.filter(s => !selectedSubjects.includes(s.name)).length === 0 ? (
                        <div className="py-12 text-center text-zinc-500">
                          {subjectSearchQuery
                            ? `No subjects found matching "${subjectSearchQuery}"`
                            : selectedSubjects.length > 0
                            ? 'All subjects selected! 🎉'
                            : 'No subjects available. Please add subjects first.'}
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {filteredSubjects
                            .filter(subject => !selectedSubjects.includes(subject.name))
                            .map((subject) => (
                              <button
                                key={subject._id}
                                type="button"
                                onClick={() => toggleSubject(subject.name)}
                                className="flex items-center gap-3 w-full p-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                              >
                                <div
                                  className="h-6 w-6 rounded shrink-0 border border-zinc-200 dark:border-zinc-700"
                                  style={{ backgroundColor: subject.color }}
                                />
                                <span className="font-medium text-zinc-900 dark:text-zinc-50 text-sm flex-1">
                                  {subject.name}
                                </span>
                                <Plus className="h-4 w-4 text-zinc-400" />
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 px-8 py-6 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {selectedSubjects.length > 0 ? (
                      <>
                        <span className="font-semibold">{selectedSubjects.length}</span> subject
                        {selectedSubjects.length !== 1 ? 's' : ''} selected
                      </>
                    ) : (
                      'Select at least one subject to continue'
                    )}
                  </p>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={closeModal} size="lg">
                      Cancel
                    </Button>
                    <Button type="submit" size="lg" className="min-w-30">
                      {editingTeacher ? 'Update Teacher' : 'Create Teacher'}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Intelligent Multi-Lesson Reassignment Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Delete Teacher - Reassign Lessons
            </DialogTitle>
            <div className="text-muted-foreground text-base pt-2">
              {teacherToDelete && (
                <>
                  <div className="mb-2">
                    You are about to delete <span className="font-semibold text-zinc-900 dark:text-zinc-100">{teacherToDelete.name}</span>.
                  </div>
                  {affectedLessons.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <span className="font-semibold">{affectedLessons.length}</span> lesson{affectedLessons.length !== 1 ? 's need' : ' needs'} reassignment.
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        Select a replacement teacher for each lesson below. Conflicts will be detected automatically.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {affectedLessons.length > 0 ? (
              affectedLessons.map((lesson, index) => {
                const reassignment = lessonReassignments[index];
                const conflictCheck = reassignment?.conflictCheck;

                return (
                  <div
                    key={lesson._id}
                    className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 space-y-3 bg-white dark:bg-zinc-900"
                  >
                    {/* Lesson Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {lesson.lessonName}
                        </h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                            {lesson.subjectIds.map(s => s.name).join(', ')}
                          </span>
                          <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            {lesson.classIds.map(c => c.name).join(', ')}
                          </span>
                          <span className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded">
                            {lesson.slots.length} period{lesson.slots.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Timetable Slots Display */}
                    {lesson.slots.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {lesson.slots.map((slot, slotIdx) => (
                          <span
                            key={slotIdx}
                            className="text-xs px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded"
                          >
                            {slot.day} P{slot.periodNumber}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Replacement Teacher Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                        Assign Replacement Teacher
                      </label>
                      <Popover
                        open={openComboboxIndex === index}
                        onOpenChange={(open) => setOpenComboboxIndex(open ? index : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-10 text-sm"
                          >
                            {reassignment?.replacementTeacherId
                              ? teachers.find((t) => t._id === reassignment.replacementTeacherId)?.name
                              : "Select teacher..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search teachers..." />
                            <CommandList>
                              <CommandEmpty>No teacher found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value=""
                                  onSelect={() => handleReplacementSelect(index, null)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      !reassignment?.replacementTeacherId ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="text-zinc-500 italic">Leave Unassigned</span>
                                </CommandItem>
                                {teachers
                                  .filter(t => t._id !== teacherToDelete?._id)
                                  .map((teacher) => (
                                    <CommandItem
                                      key={teacher._id}
                                      value={teacher.name}
                                      onSelect={() => handleReplacementSelect(index, teacher._id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          reassignment?.replacementTeacherId === teacher._id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col flex-1">
                                        <span>{teacher.name}</span>
                                        <span className="text-xs text-zinc-500">
                                          {teacher.teacherGrade} • {teacher.lessonCount || 0} lessons • {teacher.totalPeriods || 0}/35 periods
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Conflict Warnings */}
                    {conflictCheck && (
                      <div className="space-y-2">
                        {conflictCheck.hasConflict && (
                          <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs">
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-red-800 dark:text-red-200">
                                ⚠️ Schedule Clash Detected
                              </p>
                              <p className="text-red-700 dark:text-red-300 mt-1">
                                Conflicts on: {conflictCheck.conflictingSlots.map(s => `${s.day} P${s.periodNumber}`).join(', ')}
                              </p>
                            </div>
                          </div>
                        )}
                        {conflictCheck.isOverCapacity && (
                          <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-800 dark:text-amber-200">
                                📊 Workload Warning
                              </p>
                              <p className="text-amber-700 dark:text-amber-300 mt-1">
                                New workload: {conflictCheck.newWorkload}/35 periods (currently {conflictCheck.currentWorkload})
                              </p>
                            </div>
                          </div>
                        )}
                        {!conflictCheck.hasConflict && !conflictCheck.isOverCapacity && (
                          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded text-xs">
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <p className="text-green-800 dark:text-green-200">
                              ✓ No conflicts. Workload: {conflictCheck.newWorkload}/35 periods
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  This teacher is not assigned to any lessons. Safe to delete.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingTeacher}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletingTeacher}
            >
              {deletingTeacher ? 'Deleting...' : 'Delete Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
