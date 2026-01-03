'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Pencil, Trash2, Sparkles, MoreVertical, X, Search, Lightbulb, Check, ChevronsUpDown, ChevronLeft, ChevronRight, FilterX } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { generateTimetableAction, GenerateTimetableResult } from '@/app/actions/generateTimetable';
import { cn } from '@/lib/utils';
import ConflictReport from '@/components/dashboard/ConflictReport';

interface Subject {
  _id: string;
  name: string;
  color: string;
}

interface Teacher {
  _id: string;
  name: string;
  email: string;
  subjectsTaught: string[];
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [showConflictReport, setShowConflictReport] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerateTimetableResult | null>(null);

  const [formData, setFormData] = useState({
    lessonName: '',
    numberOfSingles: 0,
    numberOfDoubles: 0,
    notes: '',
  });

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [subjectSearchTerm, setSubjectSearchTerm] = useState('');
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

  // Advanced filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterStream, setFilterStream] = useState<string | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const [filterTeacherId, setFilterTeacherId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectComboOpen, setSubjectComboOpen] = useState(false);
  const [teacherComboOpen, setTeacherComboOpen] = useState(false);
  
  const ITEMS_PER_PAGE = 10;
  const GRADES = [6, 7, 8, 9, 10, 11, 12, 13];
  const STREAMS = ['Science', 'Arts', 'Commerce', 'Technology', 'General'];

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
  }, [selectedSubjects, subjects, editingLesson, formData.lessonName]);

  // Smart Teacher Suggestion: Sort teachers based on selected subjects
  const sortedTeachers = useMemo(() => {
    if (selectedSubjects.length === 0) {
      // No subjects selected, return original order
      return teachers;
    }

    // Get selected subject names
    const selectedSubjectNames = selectedSubjects
      .map(subjectId => subjects.find(s => s._id === subjectId)?.name)
      .filter(Boolean) as string[];

    // Partition teachers into suggested and others
    const suggested: Teacher[] = [];
    const others: Teacher[] = [];

    teachers.forEach(teacher => {
      // Check if teacher teaches any of the selected subjects
      const teachesSelectedSubject = teacher.subjectsTaught.some(subject =>
        selectedSubjectNames.includes(subject)
      );

      if (teachesSelectedSubject) {
        suggested.push(teacher);
      } else {
        others.push(teacher);
      }
    });

    // Return suggested teachers first, then others
    return [...suggested, ...others];
  }, [teachers, selectedSubjects, subjects]);

  // Filter sorted teachers by search term
  const filteredTeachers = useMemo(() => {
    return sortedTeachers.filter(teacher =>
      teacher.name.toLowerCase().includes(teacherSearchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(teacherSearchTerm.toLowerCase())
    );
  }, [sortedTeachers, teacherSearchTerm]);

  // Check if a teacher is suggested (teaches selected subjects)
  const isTeacherSuggested = (teacher: Teacher) => {
    if (selectedSubjects.length === 0) return false;

    const selectedSubjectNames = selectedSubjects
      .map(subjectId => subjects.find(s => s._id === subjectId)?.name)
      .filter(Boolean) as string[];

    return teacher.subjectsTaught.some(subject =>
      selectedSubjectNames.includes(subject)
    );
  };

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
    } catch {
      toast.error('Failed to load data');
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
    } catch {
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
    } catch {
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
    setClassSearchTerm('');
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
    setGenerationStep(0);

    try {
      // Simulate progress steps
      const steps = [
        { delay: 500, message: 'Fetching School Configuration & Lessons...' },
        { delay: 800, message: 'Initializing Constraint Engine...' },
        { delay: 1200, message: 'Placing Locked/Double Periods...' },
        { delay: 1500, message: 'Optimizing Teacher Workloads...' },
        { delay: 1000, message: 'Finalizing Timetable Grid...' },
      ];

      // Animate through steps
      for (let i = 0; i < steps.length; i++) {
        setGenerationStep(i + 1);
        await new Promise(resolve => setTimeout(resolve, steps[i].delay));
      }

      const result = await generateTimetableAction();
      setGenerationResult(result);

      if (result.success) {
        setGenerationStep(6); // Completion step
        
        // Small delay to show success state
        await new Promise(resolve => setTimeout(resolve, 800));
        
        toast.success(result.message);
        
        if (result.stats) {
          const statsMessage = result.stats.swapAttempts !== undefined
            ? `Stats: ${result.stats.totalSlots} slots, ${result.stats.scheduledLessons} lessons, ${result.stats.successfulSwaps}/${result.stats.swapAttempts} swaps, ${result.stats.iterations} iterations`
            : `Stats: ${result.stats.totalSlots} slots, ${result.stats.scheduledLessons} lessons`;
          
          toast.info(statsMessage, { duration: 5000 });
        }

        if (result.failedLessons && result.failedLessons.length > 0) {
          toast.warning(
            `${result.failedLessons.length} lesson(s) could not be scheduled. View Conflict Report for details.`,
            { duration: 8000 }
          );
          setShowConflictReport(true);
        } else {
          router.push('/dashboard/timetable');
        }
      } else {
        toast.error(result.message);
        setIsGenerating(false);
        setGenerationStep(0);
      }
    } catch (error: unknown) {
      console.error('Timetable generation error:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGenerating(false);
      setGenerationStep(0);
    }
  };

  const totalPeriods = formData.numberOfSingles + (formData.numberOfDoubles * 2);

  // Advanced filtering and pagination logic
  const filteredAndPaginatedLessons = useMemo(() => {
    let filtered = [...lessons];

    // Search by lesson name
    if (searchQuery.trim()) {
      filtered = filtered.filter(lesson =>
        lesson.lessonName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by grade
    if (filterGrade !== null) {
      filtered = filtered.filter(lesson =>
        lesson.classIds.some(cls => cls.grade === filterGrade)
      );
    }

    // Filter by stream (check if any class name contains the stream)
    if (filterStream) {
      filtered = filtered.filter(lesson =>
        lesson.classIds.some(cls => 
          cls.name.toLowerCase().includes(filterStream.toLowerCase())
        )
      );
    }

    // Filter by subject
    if (filterSubjectId) {
      filtered = filtered.filter(lesson =>
        lesson.subjectIds.some(subject => subject._id === filterSubjectId)
      );
    }

    // Filter by teacher
    if (filterTeacherId) {
      filtered = filtered.filter(lesson =>
        lesson.teacherIds.some(teacher => teacher._id === filterTeacherId)
      );
    }

    // Calculate pagination
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedLessons = filtered.slice(startIndex, endIndex);

    return {
      lessons: paginatedLessons,
      totalFiltered: filtered.length,
      totalPages,
      currentPage,
    };
  }, [lessons, searchQuery, filterGrade, filterStream, filterSubjectId, filterTeacherId, currentPage]);

  // Calculate total periods for filtered lessons
  const filteredStats = useMemo(() => {
    const lessons = filteredAndPaginatedLessons.lessons;
    const totalSingles = lessons.reduce((sum, lesson) => sum + lesson.numberOfSingles, 0);
    const totalDoubles = lessons.reduce((sum, lesson) => sum + lesson.numberOfDoubles, 0);
    const totalPeriods = totalSingles + (totalDoubles * 2);
    return { totalSingles, totalDoubles, totalPeriods };
  }, [filteredAndPaginatedLessons.lessons]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterGrade(null);
    setFilterStream(null);
    setFilterSubjectId(null);
    setFilterTeacherId(null);
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || filterGrade !== null || filterStream || filterSubjectId || filterTeacherId;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGrade, filterStream, filterSubjectId, filterTeacherId]);

  const generationSteps = [
    'Fetching School Configuration & Lessons...',
    'Initializing Constraint Engine...',
    'Placing Locked/Double Periods...',
    'Optimizing Teacher Workloads...',
    'Finalizing Timetable Grid...',
    'Complete! ✓',
  ];

  return (
    <div className="space-y-6">
      {/* Conflict Report Modal */}
      {showConflictReport && generationResult?.failedLessons && generationResult.failedLessons.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                Timetable Generation Conflict Report
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mt-2">
                Review detailed conflict analysis and smart swap suggestions below
              </p>
            </div>
            
            <ConflictReport 
              failedLessons={generationResult.failedLessons} 
              onClose={() => {
                setShowConflictReport(false);
                setIsGenerating(false);
                setGenerationStep(0);
                router.push('/dashboard/timetable');
              }}
            />
          </div>
        </div>
      )}

      {/* Full-Screen AI Generation Overlay */}
      {isGenerating && !showConflictReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="relative flex flex-col items-center max-w-2xl px-8">
            {/* Animated Brain/AI Icon */}
            <div className="relative mb-8">
              {generationStep < 6 ? (
                <div className="relative">
                  <div className="absolute inset-0 animate-ping">
                    <Sparkles className="h-24 w-24 text-purple-500 opacity-50" />
                  </div>
                  <div className="relative animate-pulse">
                    <Sparkles className="h-24 w-24 text-purple-400" />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-0 animate-ping">
                    <div className="h-24 w-24 rounded-full bg-green-500 opacity-50" />
                  </div>
                  <div className="relative flex items-center justify-center">
                    <div className="h-24 w-24 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-white mb-2">
              {generationStep < 6 ? 'AI Timetable Generation' : 'Generation Complete!'}
            </h2>
            <p className="text-zinc-400 text-lg mb-12">
              {generationStep < 6 
                ? 'Processing constraints and optimizing schedules...' 
                : 'Redirecting to timetable view...'}
            </p>

            {/* Progress Steps */}
            <div className="w-full max-w-xl space-y-4">
              {generationSteps.map((step, index) => {
                const stepNumber = index + 1;
                const isComplete = generationStep > stepNumber;
                const isCurrent = generationStep === stepNumber;

                return (
                  <div
                    key={index}
                    className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                      isComplete
                        ? 'bg-green-500/20 border border-green-500/50'
                        : isCurrent
                        ? 'bg-purple-500/20 border border-purple-500/50 animate-pulse'
                        : 'bg-zinc-800/50 border border-zinc-700/50'
                    }`}
                  >
                    {/* Step Icon */}
                    <div
                      className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                        isComplete
                          ? 'bg-green-500'
                          : isCurrent
                          ? 'bg-purple-500'
                          : 'bg-zinc-700'
                      }`}
                    >
                      {isComplete ? (
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isCurrent ? (
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-zinc-400 text-sm font-bold">{stepNumber}</span>
                      )}
                    </div>

                    {/* Step Text */}
                    <span
                      className={`text-sm font-medium ${
                        isComplete
                          ? 'text-green-400'
                          : isCurrent
                          ? 'text-purple-300'
                          : 'text-zinc-500'
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
            className="bg-linear-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 border-0"
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
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Lesson
          </Button>
          
          {/* Custom Modal Overlay */}
          {dialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              {/* Modal Container */}
              <div className="w-[95vw] max-w-400 h-[92vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="px-8 py-5 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-white dark:bg-zinc-900">
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                      {editingLesson ? 'Edit Lesson' : 'Create New Lesson'}
                    </h2>
                    <p className="text-base text-zinc-600 dark:text-zinc-400 mt-1">
                      Build a comprehensive lesson unit with subjects, teachers, and classes
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDialogClose(false)}
                    className="rounded-full p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Modal Content */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    
                    {/* Three-Column Selection Grid */}
                    <div className="grid grid-cols-3 gap-4 h-[45vh] min-h-100">
                      
                      {/* Column 1: Classes */}
                      <div className="flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 px-5 py-3 font-semibold text-sm flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
                          <span>📚 Select Classes</span>
                          {selectedClasses.length > 0 && (
                            <span className="bg-zinc-200 dark:bg-zinc-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              {selectedClasses.length} selected
                            </span>
                          )}
                        </div>
                        
                        <div className="flex-1 overflow-hidden flex flex-col p-4 bg-white dark:bg-zinc-900">
                          {/* Search Bar */}
                          <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Search classes..."
                              value={classSearchTerm}
                              onChange={(e) => setClassSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 bg-white dark:bg-zinc-900 text-sm"
                            />
                          </div>
                          
                          {/* Scrollable Class Grid */}
                          <div className="flex-1 overflow-y-auto pr-2">
                            <div className="grid grid-cols-3 gap-2">
                              {classes
                                .filter(classItem => 
                                  classItem.name.toLowerCase().includes(classSearchTerm.toLowerCase())
                                )
                                .map((classItem) => (
                                <button
                                  key={classItem._id}
                                  type="button"
                                  onClick={() => toggleClass(classItem._id)}
                                  className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-all ${
                                    selectedClasses.includes(classItem._id)
                                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                                  }`}
                                >
                                  {classItem.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Subjects */}
                      <div className="flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 px-5 py-3 font-semibold text-sm flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
                          <span>🎨 Select Subjects</span>
                          {selectedSubjects.length > 0 && (
                            <span className="bg-zinc-200 dark:bg-zinc-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              {selectedSubjects.length} selected
                            </span>
                          )}
                        </div>
                        
                        <div className="flex-1 overflow-hidden flex flex-col p-4 bg-white dark:bg-zinc-900">
                          {/* Search Bar */}
                          <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Search subjects..."
                              value={subjectSearchTerm}
                              onChange={(e) => setSubjectSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 bg-white dark:bg-zinc-900 text-sm"
                            />
                          </div>
                          
                          {/* Scrollable Subject List */}
                          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                            {subjects
                              .filter(subject => 
                                subject.name.toLowerCase().includes(subjectSearchTerm.toLowerCase())
                              )
                              .map((subject) => (
                              <button
                                key={subject._id}
                                type="button"
                                onClick={() => toggleSubject(subject._id)}
                                className={`w-full flex items-center gap-3 rounded-md border px-4 py-2.5 text-sm font-medium transition-all text-left ${
                                  selectedSubjects.includes(subject._id)
                                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                                }`}
                              >
                                <div 
                                  className="h-4 w-4 rounded-full shrink-0 border border-zinc-300 dark:border-zinc-600" 
                                  style={{ backgroundColor: subject.color }}
                                />
                                <span className="truncate flex-1">{subject.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Column 3: Teachers */}
                      <div className="flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 px-5 py-3 font-semibold text-sm flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
                          <span>👨‍🏫 Select Teachers</span>
                          {selectedTeachers.length > 0 && (
                            <span className="bg-zinc-200 dark:bg-zinc-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              {selectedTeachers.length} selected
                            </span>
                          )}
                        </div>
                        
                        <div className="flex-1 overflow-hidden flex flex-col p-4 bg-white dark:bg-zinc-900">
                          {/* Search Bar */}
                          <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Search teachers..."
                              value={teacherSearchTerm}
                              onChange={(e) => setTeacherSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 bg-white dark:bg-zinc-900 text-sm"
                            />
                          </div>
                          
                          {/* Scrollable Teacher List */}
                          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                            {filteredTeachers.length === 0 ? (
                              <div className="text-center py-8 text-sm text-zinc-500">
                                No teachers found
                              </div>
                            ) : (
                              filteredTeachers.map((teacher) => {
                                const isSuggested = isTeacherSuggested(teacher);
                                const isSelected = selectedTeachers.includes(teacher._id);
                                
                                return (
                                  <button
                                    key={teacher._id}
                                    type="button"
                                    onClick={() => toggleTeacher(teacher._id)}
                                    className={`w-full rounded-md border px-4 py-2.5 text-sm font-medium transition-all text-left relative ${
                                      isSelected
                                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                                        : isSuggested
                                        ? 'border-green-300 bg-green-50 hover:bg-green-100 dark:border-green-700 dark:bg-green-950/30 dark:hover:bg-green-950/50'
                                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="truncate font-semibold">{teacher.name}</span>
                                          {isSuggested && !isSelected && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-semibold shrink-0">
                                              <Lightbulb className="h-3 w-3" />
                                              Match
                                            </span>
                                          )}
                                        </div>
                                        <div className={`text-xs truncate mt-0.5 ${
                                          isSelected 
                                            ? 'text-zinc-300 dark:text-zinc-600'
                                            : 'text-zinc-600 dark:text-zinc-400'
                                        }`}>
                                          {teacher.email || 'No email'}
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Configuration Bar */}
                    <div className="grid grid-cols-12 gap-4 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-white dark:bg-zinc-900">
                      {/* Lesson Name */}
                      <div className="col-span-6">
                        <label className="mb-2 block text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          Lesson Name
                          {selectedSubjects.length === 0 && <span className="text-zinc-500 font-normal ml-2">(Select subjects first)</span>}
                          {selectedSubjects.length === 1 && <span className="text-green-600 font-semibold ml-2">✓ Auto-filled</span>}
                          {selectedSubjects.length > 1 && <span className="text-orange-600 font-bold ml-2">⚠ Required</span>}
                        </label>
                        <input
                          type="text"
                          value={formData.lessonName}
                          onChange={(e) => setFormData({ ...formData, lessonName: e.target.value })}
                          placeholder="e.g., Grade 6 Aesthetic Block"
                          required={selectedSubjects.length !== 1}
                          readOnly={selectedSubjects.length === 1}
                          className={`w-full px-4 py-2.5 border rounded-lg text-base font-medium focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 dark:bg-zinc-800 ${
                            selectedSubjects.length === 1 
                              ? 'bg-green-50 border-green-300 text-green-900 cursor-not-allowed dark:bg-green-950 dark:border-green-700' 
                              : selectedSubjects.length > 1 && !formData.lessonName
                              ? 'border-orange-500 ring-2 ring-orange-300'
                              : 'border-zinc-300'
                          }`}
                        />
                      </div>

                      {/* Single Periods */}
                      <div className="col-span-2">
                        <label className="mb-2 block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          ⏱️ Single Periods (50min)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="35"
                          value={formData.numberOfSingles}
                          onChange={(e) => setFormData({ ...formData, numberOfSingles: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-lg font-semibold text-center focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 bg-white dark:bg-zinc-800"
                        />
                      </div>

                      {/* Double Periods */}
                      <div className="col-span-2">
                        <label className="mb-2 block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          ⏰ Double Periods (100min)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="17"
                          value={formData.numberOfDoubles}
                          onChange={(e) => setFormData({ ...formData, numberOfDoubles: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-lg font-semibold text-center focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-50 bg-white dark:bg-zinc-800"
                        />
                      </div>

                      {/* Total Load Display */}
                      <div className="col-span-2">
                        <label className="mb-2 block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          📊 Total Weekly Load
                        </label>
                        <div className={`h-11 rounded-lg px-3 flex items-center justify-center text-lg font-bold border transition-all ${
                          totalPeriods > 35 
                            ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800' 
                            : totalPeriods === 0
                            ? 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:border-zinc-700'
                            : 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800'
                        }`}>
                          {totalPeriods} <span className="text-sm font-normal ml-2">/ 35 max</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between gap-4 px-8 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      {selectedClasses.length} class(es), {selectedSubjects.length} subject(s), {selectedTeachers.length} teacher(s)
                    </div>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => handleDialogClose(false)}
                        className="px-8 py-2.5 text-sm font-medium border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={totalPeriods > 35 || (selectedSubjects.length > 1 && !formData.lessonName)}
                        className="px-10 py-2.5 text-sm font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {editingLesson ? '✨ Update Lesson' : '✨ Create Lesson'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Filters Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Filters & Search</CardTitle>
              <CardDescription>
                Filter lessons by grade, stream, subject, or teacher
              </CardDescription>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="text-zinc-600 dark:text-zinc-400"
              >
                <FilterX className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Global Search */}
            <div className="lg:col-span-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                Search Lessons
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search by lesson name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Grade Filter */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                Grade
              </label>
              <select
                value={filterGrade ?? ''}
                onChange={(e) => setFilterGrade(e.target.value ? Number(e.target.value) : null)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950"
              >
                <option value="">All Grades</option>
                {GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </div>

            {/* Stream Filter */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                Stream
              </label>
              <select
                value={filterStream ?? ''}
                onChange={(e) => setFilterStream(e.target.value || null)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950"
              >
                <option value="">All Streams</option>
                {STREAMS.map((stream) => (
                  <option key={stream} value={stream}>
                    {stream}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Filter - Combobox */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                Subject
              </label>
              <Popover open={subjectComboOpen} onOpenChange={setSubjectComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={subjectComboOpen}
                    className="w-full justify-between"
                  >
                    {filterSubjectId
                      ? subjects.find((subject) => subject._id === filterSubjectId)?.name
                      : "All Subjects"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="Search subject..." />
                    <CommandList>
                      <CommandEmpty>No subject found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all-subjects"
                          onSelect={() => {
                            setFilterSubjectId(null);
                            setSubjectComboOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              filterSubjectId === null ? "opacity-100" : "opacity-0"
                            )}
                          />
                          All Subjects
                        </CommandItem>
                        {subjects.map((subject) => (
                          <CommandItem
                            key={subject._id}
                            value={subject.name}
                            onSelect={() => {
                              setFilterSubjectId(subject._id);
                              setSubjectComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                filterSubjectId === subject._id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div
                              className="w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: subject.color }}
                            />
                            {subject.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Teacher Filter - Combobox */}
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                Teacher
              </label>
              <Popover open={teacherComboOpen} onOpenChange={setTeacherComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={teacherComboOpen}
                    className="w-full justify-between"
                  >
                    {filterTeacherId
                      ? teachers.find((teacher) => teacher._id === filterTeacherId)?.name
                      : "All Teachers"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0">
                  <Command>
                    <CommandInput placeholder="Search teacher..." />
                    <CommandList>
                      <CommandEmpty>No teacher found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all-teachers"
                          onSelect={() => {
                            setFilterTeacherId(null);
                            setTeacherComboOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              filterTeacherId === null ? "opacity-100" : "opacity-0"
                            )}
                          />
                          All Teachers
                        </CommandItem>
                        {teachers.map((teacher) => (
                          <CommandItem
                            key={teacher._id}
                            value={teacher.name}
                            onSelect={() => {
                              setFilterTeacherId(teacher._id);
                              setTeacherComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                filterTeacherId === teacher._id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {teacher.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Lessons</CardTitle>
              <CardDescription>
                {filteredAndPaginatedLessons.totalFiltered !== lessons.length ? (
                  <>
                    Showing {filteredAndPaginatedLessons.lessons.length} of {filteredAndPaginatedLessons.totalFiltered} filtered lessons
                    <span className="text-zinc-400 mx-1">•</span>
                    {filteredStats.totalPeriods} periods/week ({filteredStats.totalSingles}S + {filteredStats.totalDoubles}D)
                  </>
                ) : (
                  <>
                    {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} configured
                    <span className="text-zinc-400 mx-1">•</span>
                    {filteredStats.totalPeriods} periods/week
                  </>
                )}
              </CardDescription>
            </div>
          </div>
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
                {filteredAndPaginatedLessons.lessons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                      {hasActiveFilters ? 
                        "No lessons match your filters. Try adjusting your search criteria." :
                        "No lessons created yet. Click \"Create Lesson\" to get started."
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndPaginatedLessons.lessons.map((lesson) => {
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

          {/* Pagination Controls */}
          {filteredAndPaginatedLessons.totalFiltered > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndPaginatedLessons.totalFiltered)} of {filteredAndPaginatedLessons.totalFiltered} lessons
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="text-sm text-zinc-600 dark:text-zinc-400 px-3">
                  Page {currentPage} of {filteredAndPaginatedLessons.totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === filteredAndPaginatedLessons.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
