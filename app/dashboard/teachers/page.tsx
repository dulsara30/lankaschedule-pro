'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import { toast } from 'sonner';

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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    teacherGrade: 'SLTS 3 I' as 'SLTS 3 I' | 'SLTS 2 II' | 'SLTS 2 I' | 'SLTS 1' | 'DO',
  });
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

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
    } catch {
      toast.error('Failed to delete teacher');
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
                            onClick={() => handleDelete(teacher._id)}
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
    </div>
  );
}
