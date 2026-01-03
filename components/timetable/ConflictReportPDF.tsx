import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

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

interface ConflictReportPDFProps {
  failedLessons: ConflictDiagnostic[];
  schoolName: string;
  generatedDate?: string;
}

// Professional PDF styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
    borderBottom: '2pt solid #DC2626',
    paddingBottom: 15,
  },
  schoolName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000000',
    textAlign: 'center',
  },
  mainTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 5,
  },
  subtitle: {
    fontSize: 9,
    color: '#666666',
    marginTop: 3,
    textAlign: 'center',
  },
  summarySection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#FEF2F2',
    borderRadius: 4,
    border: '1pt solid #FECACA',
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#991B1B',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  summaryCard: {
    width: '23%',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    border: '1pt solid #E5E7EB',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 8,
    color: '#6B7280',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
    color: '#111827',
    borderBottom: '1pt solid #E5E7EB',
    paddingBottom: 5,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    borderBottomStyle: 'solid',
    minHeight: 25,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    borderBottomStyle: 'solid',
    minHeight: 30,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 30,
  },
  colLessonName: {
    width: '28%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    borderRightStyle: 'solid',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
  },
  colFailureReason: {
    width: '32%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    borderRightStyle: 'solid',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
  },
  colTeacher: {
    width: '10%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    borderRightStyle: 'solid',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colClass: {
    width: '10%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    borderRightStyle: 'solid',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colDouble: {
    width: '10%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    borderRightStyle: 'solid',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colPeriods: {
    width: '10%',
    padding: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
  },
  cellText: {
    fontSize: 8,
    color: '#111827',
  },
  cellTextCenter: {
    fontSize: 8,
    color: '#111827',
    textAlign: 'center',
  },
  cellTextSmall: {
    fontSize: 7,
    color: '#6B7280',
    lineHeight: 1.3,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 8,
    borderTop: '1pt solid #E5E7EB',
    paddingTop: 8,
  },
  pageNumber: {
    fontSize: 8,
    color: '#6B7280',
  },
  badge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 3,
    padding: '3 6',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 8,
    color: '#991B1B',
    fontWeight: 'bold',
  },
  conflictHighlight: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  conflictModerate: {
    color: '#D97706',
    fontWeight: 'bold',
  },
  conflictLow: {
    color: '#2563EB',
  },
  swapSuggestionSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    border: '1pt solid #DBEAFE',
  },
  swapSuggestionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1E40AF',
  },
  swapItem: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    border: '1pt solid #E5E7EB',
  },
  swapText: {
    fontSize: 8,
    color: '#374151',
    marginBottom: 3,
  },
  recommendationSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 4,
    border: '1pt solid #FDE68A',
  },
  recommendationTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#92400E',
  },
  recommendationText: {
    fontSize: 8,
    color: '#78350F',
    marginBottom: 4,
    lineHeight: 1.4,
  },
});

const ConflictReportPDF: React.FC<ConflictReportPDFProps> = ({
  failedLessons,
  schoolName,
  generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
}) => {
  // Calculate summary statistics
  const totalFailed = failedLessons.length;
  const withSwapSuggestions = failedLessons.filter(
    (l) => l.suggestedSwaps && l.suggestedSwaps.length > 0
  ).length;
  const easySwaps = failedLessons.reduce(
    (sum, l) => sum + (l.suggestedSwaps?.filter((s) => s.swapFeasibility === 'easy').length || 0),
    0
  );
  const totalPeriods = failedLessons.reduce((sum, l) => sum + l.requiredPeriods, 0);

  // Get conflict severity for styling
  const getConflictSeverity = (count: number) => {
    if (count > 30) return 'high';
    if (count > 15) return 'moderate';
    return 'low';
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.mainTitle}>Timetable Generation Conflict Audit</Text>
          <Text style={styles.subtitle}>Generated on {generatedDate}</Text>
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Executive Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Failed Lessons</Text>
              <Text style={styles.summaryValue}>{totalFailed}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>With Swap Suggestions</Text>
              <Text style={styles.summaryValue}>{withSwapSuggestions}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Easy Swaps</Text>
              <Text style={styles.summaryValue}>{easySwaps}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Periods</Text>
              <Text style={styles.summaryValue}>{totalPeriods}</Text>
            </View>
          </View>
        </View>

        {/* Detailed Conflict Table */}
        <Text style={styles.sectionTitle}>Detailed Conflict Analysis</Text>
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.colLessonName}>
              <Text style={styles.headerText}>Lesson Name</Text>
            </View>
            <View style={styles.colFailureReason}>
              <Text style={styles.headerText}>Failure Reason</Text>
            </View>
            <View style={styles.colTeacher}>
              <Text style={styles.headerText}>Teacher{'\n'}Conflicts</Text>
            </View>
            <View style={styles.colClass}>
              <Text style={styles.headerText}>Class{'\n'}Conflicts</Text>
            </View>
            <View style={styles.colDouble}>
              <Text style={styles.headerText}>Double{'\n'}Slot Issues</Text>
            </View>
            <View style={styles.colPeriods}>
              <Text style={styles.headerText}>Periods{'\n'}Required</Text>
            </View>
          </View>

          {/* Table Rows */}
          {failedLessons.map((lesson, index) => {
            const isLast = index === failedLessons.length - 1;
            const teacherSeverity = getConflictSeverity(lesson.detailedConflicts.teacherBusyCount);
            const classSeverity = getConflictSeverity(lesson.detailedConflicts.classBusyCount);
            const doubleSeverity = getConflictSeverity(lesson.detailedConflicts.noDoubleSlotCount);

            return (
              <View key={lesson.lessonId} style={isLast ? styles.tableRowLast : styles.tableRow}>
                <View style={styles.colLessonName}>
                  <Text style={styles.cellText}>{lesson.lessonName}</Text>
                </View>
                <View style={styles.colFailureReason}>
                  <Text style={styles.cellTextSmall}>{lesson.failureReason}</Text>
                </View>
                <View style={styles.colTeacher}>
                  <Text
                    style={[
                      styles.cellTextCenter,
                      teacherSeverity === 'high'
                        ? styles.conflictHighlight
                        : teacherSeverity === 'moderate'
                        ? styles.conflictModerate
                        : styles.conflictLow,
                    ]}
                  >
                    {lesson.detailedConflicts.teacherBusyCount}
                  </Text>
                </View>
                <View style={styles.colClass}>
                  <Text
                    style={[
                      styles.cellTextCenter,
                      classSeverity === 'high'
                        ? styles.conflictHighlight
                        : classSeverity === 'moderate'
                        ? styles.conflictModerate
                        : styles.conflictLow,
                    ]}
                  >
                    {lesson.detailedConflicts.classBusyCount}
                  </Text>
                </View>
                <View style={styles.colDouble}>
                  <Text
                    style={[
                      styles.cellTextCenter,
                      doubleSeverity === 'high'
                        ? styles.conflictHighlight
                        : doubleSeverity === 'moderate'
                        ? styles.conflictModerate
                        : styles.conflictLow,
                    ]}
                  >
                    {lesson.detailedConflicts.noDoubleSlotCount}
                  </Text>
                </View>
                <View style={styles.colPeriods}>
                  <Text style={styles.cellTextCenter}>{lesson.requiredPeriods}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.pageNumber}>
            Page 1 of {Math.ceil(failedLessons.length / 15) || 1} • Conflict Report Generated by
            EduFlow AI
          </Text>
        </View>
      </Page>

      {/* Additional Pages for Swap Suggestions (if there are failed lessons with suggestions) */}
      {failedLessons.filter((l) => l.suggestedSwaps && l.suggestedSwaps.length > 0).length > 0 && (
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.schoolName}>{schoolName}</Text>
            <Text style={styles.mainTitle}>Smart Swap Recommendations</Text>
            <Text style={styles.subtitle}>Detailed Suggestions for Conflict Resolution</Text>
          </View>

          {/* Swap Suggestions */}
          {failedLessons
            .filter((l) => l.suggestedSwaps && l.suggestedSwaps.length > 0)
            .slice(0, 8)
            .map((lesson, lessonIndex) => (
              <View key={lesson.lessonId} style={styles.swapSuggestionSection}>
                <Text style={styles.swapSuggestionTitle}>
                  {lessonIndex + 1}. {lesson.lessonName} ({lesson.requiredPeriods} periods)
                </Text>
                {lesson.suggestedSwaps!.slice(0, 3).map((swap, swapIndex) => (
                  <View key={swapIndex} style={styles.swapItem}>
                    <Text style={styles.swapText}>
                      • Target Slot: {swap.targetSlot.day}, Period {swap.targetSlot.period}
                    </Text>
                    <Text style={styles.swapText}>
                      • Conflicting: {swap.conflictingLesson.lessonName}
                    </Text>
                    <Text style={styles.swapText}>
                      • Alternatives: {swap.alternativeSlots.map((a) => `${a.day} P${a.period}`).join(', ')}
                    </Text>
                    <Text style={styles.swapText}>
                      • Feasibility:{' '}
                      {swap.swapFeasibility === 'easy' ? '✓ Easy' : swap.swapFeasibility === 'moderate' ? '⚠ Moderate' : '✗ Hard'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.pageNumber}>Page 2 • Swap Recommendations</Text>
          </View>
        </Page>
      )}

      {/* Recommendations Page */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.mainTitle}>Recommendations & Action Items</Text>
          <Text style={styles.subtitle}>Guidance for Resolving Scheduling Conflicts</Text>
        </View>

        {/* General Recommendations */}
        <View style={styles.recommendationSection}>
          <Text style={styles.recommendationTitle}>General Recommendations</Text>
          {failedLessons.some((l) => l.detailedConflicts.teacherBusyCount > 30) && (
            <Text style={styles.recommendationText}>
              • HIGH PRIORITY: Multiple lessons show excessive teacher conflicts (30+ instances).
              Consider reducing teacher workload or hiring additional staff for affected subjects.
            </Text>
          )}
          {failedLessons.some((l) => l.detailedConflicts.noDoubleSlotCount > 15) && (
            <Text style={styles.recommendationText}>
              • INTERVAL PLACEMENT: Review current interval schedule. Many lessons cannot find
              consecutive double periods due to interval breaks. Consider adjusting interval timing
              or reducing double period requirements.
            </Text>
          )}
          {failedLessons.some((l) => l.detailedConflicts.classBusyCount > 30) && (
            <Text style={styles.recommendationText}>
              • CLASS OVERLOAD: Several classes are over-scheduled with too many lessons. Review
              total lesson count per class and consider reducing weekly period requirements.
            </Text>
          )}
          {failedLessons.some((l) => l.detailedConflicts.dailyLimitCount > 2) && (
            <Text style={styles.recommendationText}>
              • DAILY LIMIT CONFLICTS: Multiple lessons hit the daily subject limit (one lesson per
              day per class). Consider redistributing single/double period ratios to spread lessons
              across more days.
            </Text>
          )}
        </View>

        {/* Per-Lesson Recommendations */}
        <Text style={styles.sectionTitle}>Lesson-Specific Action Items</Text>
        {failedLessons.slice(0, 10).map((lesson, index) => (
          <View key={lesson.lessonId} style={{ marginBottom: 12 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {index + 1}. {lesson.lessonName}
              </Text>
            </View>
            <View style={{ marginLeft: 10, marginTop: 4 }}>
              {lesson.detailedConflicts.teacherBusyCount > 30 && (
                <Text style={styles.cellTextSmall}>
                  → Reduce teacher workload or add more teachers for this subject
                </Text>
              )}
              {lesson.detailedConflicts.noDoubleSlotCount > 15 && (
                <Text style={styles.cellTextSmall}>
                  → Convert some double periods to single periods or adjust interval placement
                </Text>
              )}
              {lesson.detailedConflicts.classBusyCount > 30 && (
                <Text style={styles.cellTextSmall}>
                  → Classes are over-scheduled - reduce total lesson count
                </Text>
              )}
              {lesson.detailedConflicts.dailyLimitCount > 2 && (
                <Text style={styles.cellTextSmall}>
                  → Adjust single/double period ratios to distribute across more days
                </Text>
              )}
              {lesson.suggestedSwaps && lesson.suggestedSwaps.length > 0 ? (
                <Text style={styles.cellTextSmall}>
                  → {lesson.suggestedSwaps.length} swap suggestion(s) available - review page 2
                </Text>
              ) : (
                <Text style={styles.cellTextSmall}>
                  → No simple swaps available - manual intervention required
                </Text>
              )}
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.pageNumber}>
            Final Page • Recommendations & Next Steps
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default ConflictReportPDF;
