'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Pencil, Trash2, Info, Search, Filter, ChevronLeft, ChevronRight, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Teacher {
  _id: string;
  name: string;
}

interface Class {
  _id: string;
  name: string;
  grade: number | string;
  stream?: string;
  classTeacher?: Teacher;
  lessonCount: number;
  totalWeeklyPeriods: number;
}

const STREAMS = ['Science', 'Arts', 'Commerce', 'Technology'] as const;
const ITEMS_PER_PAGE = 10;

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [teacherComboOpen, setTeacherComboOpen] = useState(false);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [streamFilter, setStreamFilter] = useState<string>('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  
  const [formData, setFormData] = useState({
    grade: 6 as number | string,
    stream: '',
    numberOfParallelClasses: 1,
    customPrefix: '',
    classTeacher: '',
  });

  // Generate class names in real-time
  const generatedClassNames = useMemo(() => {
    const count = formData.numberOfParallelClasses;
    if (count < 0 || count > 26) return [];
    
    // Get grade display text
    const gradeText = formData.grade === '13-years' ? '13 Years' : `Grade ${formData.grade}`;
    const gradeShort = formData.grade === '13-years' ? '13Y' : String(formData.grade);
    
    // If count is 0 or 1, no suffix - just "Grade 6" or "13 Years"
    if (count <= 1) {
      let name = gradeText;
      if (formData.stream) {
        name = `${gradeText} - ${formData.stream}`;
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
      let name = `${gradeShort}-${letters[i]}`;
      if (formData.stream) {
        name = `${gradeShort}-${formData.stream}-${letters[i]}`;
      }
      if (formData.customPrefix) {
        name = `${formData.customPrefix}-${letters[i]}`;
      }
      names.push(name);
    }
    
    return names;
  }, [formData.grade, formData.stream, formData.numberOfParallelClasses, formData.customPrefix]);

  // Filtered and searched classes
  const filteredClasses = useMemo(() => {
    let filtered = [...classes];

    // Search by name or grade
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((classItem) => {
        const gradeText = classItem.grade === '13-years' ? '13 years' : `grade ${classItem.grade}`;
        return (
          classItem.name.toLowerCase().includes(query) ||
          gradeText.includes(query) ||
          (classItem.stream && classItem.stream.toLowerCase().includes(query))
        );
      });
    }

    // Filter by grade
    if (gradeFilter) {
      filtered = filtered.filter((classItem) => String(classItem.grade) === gradeFilter);
    }

    // Filter by stream
    if (streamFilter) {
      filtered = filtered.filter((classItem) => classItem.stream === streamFilter);
    }

    return filtered;
  }, [classes, searchQuery, gradeFilter, streamFilter]);

  // Paginated classes
  const getPaginatedClasses = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredClasses.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredClasses.length / ITEMS_PER_PAGE);

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, gradeFilter, streamFilter]);

  const fetchClasses = async () => {
    try {
      const response = await fetch('/api/classes');
      const data = await response.json();
      if (data.success) {
        setClasses(data.data);
      }
    } catch {
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch('/api/teachers');
      const data = await response.json();
      if (data.success) {
        setTeachers(data.data);
      }
    } catch {
      toast.error('Failed to load teachers');
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
            stream: formData.stream || '',
            classTeacher: formData.classTeacher || null,
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
        stream: formData.stream || '',
        classTeacher: formData.classTeacher || null,
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
    } catch {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem);
    
    // Extract classTeacher ID safely - handle both populated object and string ID
    let teacherId = '';
    if (classItem.classTeacher) {
      if (typeof classItem.classTeacher === 'object' && classItem.classTeacher._id) {
        teacherId = classItem.classTeacher._id;
      } else if (typeof classItem.classTeacher === 'string') {
        teacherId = classItem.classTeacher;
      }
    }
    
    setFormData({
      grade: classItem.grade,
      stream: classItem.stream || '',
      numberOfParallelClasses: 1,
      customPrefix: classItem.name.split('-')[0] + '-' + (classItem.stream || ''),
      classTeacher: teacherId,
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
    } catch {
      toast.error('Failed to delete class');
    }
  };

  const resetForm = () => {
    setFormData({ 
      grade: 6 as number | string, 
      stream: '',
      numberOfParallelClasses: 1,
      customPrefix: '',
      classTeacher: '',
    });
    setEditingClass(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const getGradeBadgeColor = (grade: number | string) => {
    if (typeof grade === 'number') {
      if (grade <= 5) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      if (grade <= 9) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      if (grade <= 11) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    }
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
  };

  const clearFilters = () => {
    setSearchQuery('');
    setGradeFilter('');
    setStreamFilter('');
  };

  const hasActiveFilters = searchQuery || gradeFilter || streamFilter;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Classes
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage classes, grade levels, and track assigned lessons
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Class
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
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
                  onChange={(e) => {
                    const value = e.target.value === '13-years' ? '13-years' : parseInt(e.target.value);
                    setFormData({ ...formData, grade: value });
                  }}
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                  required
                >
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((grade) => (
                    <option key={grade} value={grade}>
                      Grade {grade}
                    </option>
                  ))}
                  <option value="13-years">13 Years</option>
                </select>
              </div>

              {((typeof formData.grade === 'number' && formData.grade >= 12) || formData.grade === '13-years') && (
                <div>
                  <label htmlFor="stream" className="mb-2 block text-sm font-medium">
                    Stream (for Grades 12-13)
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
                    Select applicable stream for grades 10-13 (Science, Arts, Commerce, Technology)
                  </p>
                </div>
              )}

              {/* Class Teacher Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Class Teacher (Optional)
                </label>
                <Popover open={teacherComboOpen} onOpenChange={setTeacherComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={teacherComboOpen}
                      className="w-full justify-between"
                    >
                      {formData.classTeacher
                        ? teachers.find((t) => t._id === formData.classTeacher)?.name
                        : "Select class teacher..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search teachers..." />
                      <CommandList>
                        <CommandEmpty>No teacher found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setFormData({ ...formData, classTeacher: '' });
                              setTeacherComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.classTeacher === '' ? "opacity-100" : "opacity-0"
                              )}
                            />
                            No teacher assigned
                          </CommandItem>
                          {teachers.map((teacher) => (
                            <CommandItem
                              key={teacher._id}
                              value={teacher.name}
                              onSelect={() => {
                                setFormData({ ...formData, classTeacher: teacher._id });
                                setTeacherComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.classTeacher === teacher._id ? "opacity-100" : "opacity-0"
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
                <p className="mt-1 text-xs text-zinc-500">
                  Assign a teacher responsible for this class
                </p>
              </div>

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Classes</CardTitle>
              <CardDescription>
                {filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''} found
                {hasActiveFilters && ` (filtered from ${classes.length} total)`}
              </CardDescription>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search by class name or grade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Grade Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white pl-10 pr-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
              >
                <option value="">All Grades</option>
                {Array.from({ length: 13 }, (_, i) => i + 1).map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
                <option value="13-years">13 Years</option>
              </select>
            </div>

            {/* Stream Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <select
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white pl-10 pr-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
              >
                <option value="">All Streams</option>
                {STREAMS.map((stream) => (
                  <option key={stream} value={stream}>
                    {stream}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Loading classes...</div>
          ) : filteredClasses.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-zinc-500 mb-2">
                {hasActiveFilters
                  ? 'No classes match your search criteria.'
                  : 'No classes found. Add your first class to get started.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class Name</TableHead>
                    <TableHead>Grade Level</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Class Teacher</TableHead>
                    <TableHead>Assigned Lessons</TableHead>
                    <TableHead>Weekly Load</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getPaginatedClasses().map((classItem) => (
                    <TableRow key={classItem._id}>
                      <TableCell className="font-medium">{classItem.name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getGradeBadgeColor(classItem.grade)}`}>
                          {classItem.grade === '13-years' ? '13 Years' : `Grade ${classItem.grade}`}
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
                      <TableCell>
                        {classItem.classTeacher && typeof classItem.classTeacher === 'object' && classItem.classTeacher.name ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            👤 {classItem.classTeacher.name}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-400">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          classItem.lessonCount === 0 
                            ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        }`}>
                          {classItem.lessonCount} {classItem.lessonCount === 1 ? 'Lesson' : 'Lessons'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {classItem.totalWeeklyPeriods > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              classItem.totalWeeklyPeriods > 40
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : classItem.totalWeeklyPeriods > 35
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            }`}>
                              {classItem.totalWeeklyPeriods} Periods
                            </span>
                            {classItem.totalWeeklyPeriods > 40 && (
                              <span className="text-xs text-red-600 dark:text-red-400" title="Exceeds typical weekly capacity">
                                ⚠
                              </span>
                            )}
                          </div>
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
                            className="hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(classItem._id)}
                            className="hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    Showing <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * ITEMS_PER_PAGE, filteredClasses.length)}
                    </span>{' '}
                    of <span className="font-medium">{filteredClasses.length}</span> results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        // Show first page, last page, current page, and pages around current
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="min-w-9"
                            >
                              {page}
                            </Button>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <span key={page} className="px-2 text-zinc-500">
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
