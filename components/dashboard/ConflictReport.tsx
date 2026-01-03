'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowRightLeft, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ConflictReportPDF from '@/components/timetable/ConflictReportPDF';

interface ConflictDiagnostic {
  lessonId: string;
  lessonName: string;
  requiredPeriods: number;
  failureReason: string;
  detailedConflicts: {
    teacherBusyCount: number;
    classBusyCount: number;
    noDoubleSlotCount: number;
    dailyLimitCount: number;
  };
  suggestedSwaps?: SwapSuggestion[];
}

interface SwapSuggestion {
  targetSlot: { day: string; period: number };
  conflictingLesson: {
    lessonId: string;
    lessonName: string;
  };
  alternativeSlots: { day: string; period: number }[];
  swapFeasibility: 'easy' | 'moderate' | 'hard';
}

interface ConflictReportProps {
  failedLessons: ConflictDiagnostic[];
  schoolName?: string;
  onClose?: () => void;
}

export default function ConflictReport({ failedLessons, schoolName = 'School', onClose }: ConflictReportProps) {
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [isPDFReady, setIsPDFReady] = useState(false);

  const toggleExpanded = (lessonId: string) => {
    setExpandedLesson(expandedLesson === lessonId ? null : lessonId);
  };

  const getSeverityColor = (diagnostic: ConflictDiagnostic): string => {
    const { teacherBusyCount, classBusyCount, noDoubleSlotCount, dailyLimitCount } = diagnostic.detailedConflicts;
    const totalConflicts = teacherBusyCount + classBusyCount + noDoubleSlotCount + dailyLimitCount;

    if (totalConflicts > 50) return 'destructive';
    if (totalConflicts > 20) return 'warning';
    return 'secondary';
  };

  const getSeverityIcon = (diagnostic: ConflictDiagnostic) => {
    const { teacherBusyCount, classBusyCount, noDoubleSlotCount, dailyLimitCount } = diagnostic.detailedConflicts;
    const totalConflicts = teacherBusyCount + classBusyCount + noDoubleSlotCount + dailyLimitCount;

    if (totalConflicts > 50) return <AlertCircle className="h-5 w-5 text-red-500" />;
    if (totalConflicts > 20) return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <AlertCircle className="h-5 w-5 text-blue-500" />;
  };

  const getFeasibilityBadge = (feasibility: 'easy' | 'moderate' | 'hard') => {
    const colors = {
      easy: 'bg-green-100 text-green-800 border-green-300',
      moderate: 'bg-amber-100 text-amber-800 border-amber-300',
      hard: 'bg-red-100 text-red-800 border-red-300',
    };

    return (
      <Badge variant="outline" className={colors[feasibility]}>
        {feasibility === 'easy' ? '✓ Easy' : feasibility === 'moderate' ? '⚠ Moderate' : '✗ Hard'}
      </Badge>
    );
  };

  if (failedLessons.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-6 w-6" />
            All Lessons Scheduled Successfully
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-green-600">
            No conflicts detected. All lessons have been scheduled without issues.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-6 w-6" />
            Scheduling Conflicts Detected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 font-medium mb-4">
            {failedLessons.length} lesson{failedLessons.length > 1 ? 's' : ''} could not be scheduled.
            Review the detailed conflict analysis below and use the swap suggestions to resolve issues.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <div className="text-xs text-gray-600 mb-1">Failed Lessons</div>
              <div className="text-2xl font-bold text-red-700">{failedLessons.length}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="text-xs text-gray-600 mb-1">With Swap Suggestions</div>
              <div className="text-2xl font-bold text-amber-700">
                {failedLessons.filter(l => l.suggestedSwaps && l.suggestedSwaps.length > 0).length}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-gray-600 mb-1">Easy Swaps</div>
              <div className="text-2xl font-bold text-blue-700">
                {failedLessons.reduce((sum, l) => 
                  sum + (l.suggestedSwaps?.filter(s => s.swapFeasibility === 'easy').length || 0), 0
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <div className="text-xs text-gray-600 mb-1">Total Periods</div>
              <div className="text-2xl font-bold text-purple-700">
                {failedLessons.reduce((sum, l) => sum + l.requiredPeriods, 0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Conflict List */}
      {failedLessons.map((diagnostic) => {
        const isExpanded = expandedLesson === diagnostic.lessonId;
        const severity = getSeverityColor(diagnostic);
        const hasSuggestions = diagnostic.suggestedSwaps && diagnostic.suggestedSwaps.length > 0;

        return (
          <Card key={diagnostic.lessonId} className={`border-l-4 ${
            severity === 'destructive' ? 'border-l-red-500' :
            severity === 'warning' ? 'border-l-amber-500' :
            'border-l-blue-500'
          }`}>
            <CardHeader 
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleExpanded(diagnostic.lessonId)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getSeverityIcon(diagnostic)}
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{diagnostic.lessonName}</CardTitle>
                    <p className="text-sm text-gray-600 mb-2">{diagnostic.failureReason}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        {diagnostic.requiredPeriods} periods required
                      </Badge>
                      {hasSuggestions && diagnostic.suggestedSwaps && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          {diagnostic.suggestedSwaps.length} swap{diagnostic.suggestedSwaps.length > 1 ? 's' : ''} available
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </Button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-4">
                {/* Detailed Conflict Breakdown */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-3 text-gray-700">Conflict Analysis</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded p-3 border">
                      <div className="text-xs text-gray-600 mb-1">Teacher Conflicts</div>
                      <div className={`text-xl font-bold ${
                        diagnostic.detailedConflicts.teacherBusyCount > 30 ? 'text-red-600' :
                        diagnostic.detailedConflicts.teacherBusyCount > 15 ? 'text-amber-600' :
                        'text-blue-600'
                      }`}>
                        {diagnostic.detailedConflicts.teacherBusyCount}
                      </div>
                    </div>
                    <div className="bg-white rounded p-3 border">
                      <div className="text-xs text-gray-600 mb-1">Class Conflicts</div>
                      <div className={`text-xl font-bold ${
                        diagnostic.detailedConflicts.classBusyCount > 30 ? 'text-red-600' :
                        diagnostic.detailedConflicts.classBusyCount > 15 ? 'text-amber-600' :
                        'text-blue-600'
                      }`}>
                        {diagnostic.detailedConflicts.classBusyCount}
                      </div>
                    </div>
                    <div className="bg-white rounded p-3 border">
                      <div className="text-xs text-gray-600 mb-1">No Double Slots</div>
                      <div className={`text-xl font-bold ${
                        diagnostic.detailedConflicts.noDoubleSlotCount > 20 ? 'text-red-600' :
                        diagnostic.detailedConflicts.noDoubleSlotCount > 10 ? 'text-amber-600' :
                        'text-blue-600'
                      }`}>
                        {diagnostic.detailedConflicts.noDoubleSlotCount}
                      </div>
                    </div>
                    <div className="bg-white rounded p-3 border">
                      <div className="text-xs text-gray-600 mb-1">Daily Limit Hits</div>
                      <div className={`text-xl font-bold ${
                        diagnostic.detailedConflicts.dailyLimitCount > 3 ? 'text-red-600' :
                        diagnostic.detailedConflicts.dailyLimitCount > 1 ? 'text-amber-600' :
                        'text-blue-600'
                      }`}>
                        {diagnostic.detailedConflicts.dailyLimitCount}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Swap Suggestions */}
                {hasSuggestions && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h4 className="font-semibold text-sm mb-3 text-blue-900 flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Smart Swap Suggestions
                    </h4>
                    <div className="space-y-3">
                      {diagnostic.suggestedSwaps!.map((swap, index) => (
                        <div key={index} className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-medium text-sm text-gray-900">
                                {swap.targetSlot.day}, Period {swap.targetSlot.period}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                Currently occupied by: <span className="font-medium">{swap.conflictingLesson.lessonName}</span>
                              </div>
                            </div>
                            {getFeasibilityBadge(swap.swapFeasibility)}
                          </div>
                          
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-600 mb-1">Alternative slots for {swap.conflictingLesson.lessonName}:</div>
                            <div className="flex flex-wrap gap-2">
                              {swap.alternativeSlots.map((alt, altIndex) => (
                                <Badge key={altIndex} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                  {alt.day} P{alt.period}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <Button 
                            size="sm" 
                            className="w-full mt-3 bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              // TODO: Implement manual swap action
                              console.log('Swap suggestion:', swap);
                            }}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            Apply Swap
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <h4 className="font-semibold text-sm mb-2 text-amber-900">Recommendations</h4>
                  <ul className="text-sm text-amber-800 space-y-1">
                    {diagnostic.detailedConflicts.teacherBusyCount > 30 && (
                      <li>• Consider reducing teacher workload or adding more teachers for this subject</li>
                    )}
                    {diagnostic.detailedConflicts.noDoubleSlotCount > 15 && (
                      <li>• Review interval placement - it may be blocking too many double period slots</li>
                    )}
                    {diagnostic.detailedConflicts.classBusyCount > 30 && (
                      <li>• Classes may be over-scheduled. Consider reducing total lesson count</li>
                    )}
                    {diagnostic.detailedConflicts.dailyLimitCount > 2 && (
                      <li>• Try redistributing single/double period ratios to avoid daily limit conflicts</li>
                    )}
                    {!hasSuggestions && (
                      <li>• No simple swaps available. Manual intervention required - try adjusting lesson requirements</li>
                    )}
                  </ul>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onClose}>
          Close Report
        </Button>
        {isPDFReady ? (
          <PDFDownloadLink
            document={
              <ConflictReportPDF
                failedLessons={failedLessons}
                schoolName={schoolName}
                generatedDate={new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              />
            }
            fileName={`Conflict_Report_${new Date().toISOString().split('T')[0]}.pdf`}
          >
            {({ loading }) => (
              <Button className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
                <Download className="mr-2 h-4 w-4" />
                {loading ? 'Preparing PDF...' : 'Export Conflict Report'}
              </Button>
            )}
          </PDFDownloadLink>
        ) : (
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setIsPDFReady(true)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Conflict Report
          </Button>
        )}
      </div>
    </div>
  );
}
