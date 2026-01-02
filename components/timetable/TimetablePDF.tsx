import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Professional black and white styles for traditional timetable
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 25,
    alignItems: 'center',
    borderBottom: '2pt solid #000000',
    paddingBottom: 15,
  },
  schoolName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#000000',
    textAlign: 'center',
  },
  schoolAddress: {
    fontSize: 8,
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  versionName: {
    fontSize: 9,
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 5,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    marginTop: 15,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    minHeight: 24,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 24,
  },
  tableColHeader: {
    width: '12%',
    borderRightWidth: 1,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#E8E8E8',
    padding: 4,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableColHeaderLast: {
    width: '12%',
    backgroundColor: '#E8E8E8',
    padding: 4,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodCol: {
    width: '8%',
    borderRightWidth: 1,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#E8E8E8',
    padding: 4,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeCol: {
    width: '12%',
    borderRightWidth: 1,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#E8E8E8',
    padding: 4,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCol: {
    width: '16%',
    borderRightWidth: 1,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    padding: 3,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 24,
  },
  dayColLast: {
    width: '16%',
    padding: 3,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 24,
  },
  headerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  cellText: {
    fontSize: 9,
    color: '#000000',
    textAlign: 'center',
  },
  cellTextBold: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 2,
  },
  cellTextSmall: {
    fontSize: 8,
    color: '#000000',
    textAlign: 'center',
  },
  doublePeriodLabel: {
    fontSize: 7,
    color: '#666666',
    textAlign: 'center',
  },
  intervalRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    minHeight: 20,
    backgroundColor: '#E8E8E8',
  },
  intervalCell: {
    width: '100%',
    padding: 3,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  intervalText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  signatureSection: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  signatureBox: {
    width: '45%',
  },
  signatureLine: {
    borderTop: '1pt solid #000000',
    marginTop: 30,
    paddingTop: 5,
  },
  signatureText: {
    fontSize: 8,
    color: '#000000',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: '1pt solid #CCCCCC',
    paddingTop: 8,
  },
  footerLogo: {
    width: 15,
    height: 15,
    marginRight: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#666666',
  },
});

interface Subject {
  _id: string;
  name: string;
  color: string;
}

interface Teacher {
  _id: string;
  name: string;
}

interface Class {
  _id: string;
  name: string;
  grade: number | string;
}

interface Lesson {
  _id: string;
  lessonName: string;
  subjectIds: Subject[];
  teacherIds: Teacher[];
  classIds: Class[];
}

interface TimetableSlot {
  _id: string;
  classId: Class;
  lessonId: Lesson;
  day: string;
  periodNumber: number;
  isDoubleStart?: boolean;
  isDoubleEnd?: boolean;
}

interface SchoolConfig {
  startTime: string;
  periodDuration: number;
  numberOfPeriods: number;
  intervalSlots: Array<{ afterPeriod: number; duration: number }>;
}

interface TimetableEntity {
  id: string;
  name: string;
}

interface TimetablePDFProps {
  type: 'class' | 'teacher';
  entities: TimetableEntity[]; // Support for bulk export
  versionName: string;
  slots: TimetableSlot[];
  config: SchoolConfig;
  lessonNameMap: Record<string, string>;
  schoolName?: string;
  schoolAddress?: string;
  showTimeColumn?: boolean;
  showPrincipalSignature?: boolean;
  showClassTeacherSignature?: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TimetablePDF: React.FC<TimetablePDFProps> = ({
  type,
  entities,
  versionName,
  slots,
  config,
  lessonNameMap,
  schoolName = 'EduFlow AI',
  schoolAddress = '',
  showTimeColumn = true,
  showPrincipalSignature = false,
  showClassTeacherSignature = false,
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Calculate column widths based on showTimeColumn
  const periodColWidth = '8%';
  const timeColWidth = showTimeColumn ? '12%' : '0%';
  // When time column is hidden, redistribute its 12% to the 5 day columns (2.4% each)
  const dayColWidth = showTimeColumn ? '16%' : '18.4%';

  // Calculate time for a given period
  const calculateTime = (periodNumber: number): string => {
    const [hours, minutes] = config.startTime.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes;
    
    totalMinutes += (periodNumber - 1) * config.periodDuration;
    
    for (const interval of config.intervalSlots) {
      if (interval.afterPeriod < periodNumber) {
        totalMinutes += interval.duration;
      }
    }
    
    const resultHours = Math.floor(totalMinutes / 60);
    const resultMinutes = totalMinutes % 60;
    
    return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`;
  };

  // Get slot for a specific day and period
  const getSlotForPeriod = (day: string, period: number, entityId: string): TimetableSlot | undefined => {
    const normalizedDay = String(day).trim().toLowerCase();
    if (type === 'class') {
      return slots.find(
        slot => String(slot.day).trim().toLowerCase() === normalizedDay && 
                Number(slot.periodNumber) === period && 
                slot.classId?._id === entityId
      );
    } else {
      return slots.find(
        slot => String(slot.day).trim().toLowerCase() === normalizedDay && 
                Number(slot.periodNumber) === period &&
                slot.lessonId?.teacherIds?.some((teacher: Teacher) => teacher._id === entityId)
      );
    }
  };

  // Get the display text for a slot
  const getSlotDisplayText = (slot: TimetableSlot | undefined): string => {
    if (!slot || !slot.lessonId) return '';
    
    const lessonName = lessonNameMap[slot.lessonId._id] || slot.lessonId.lessonName;
    
    if (type === 'teacher' && slot.classId) {
      return `${lessonName} - ${slot.classId.name}`;
    }
    
    return lessonName;
  };

  // Get interval info
  const getIntervalInfo = (period: number): { duration: number; startTime: string } | null => {
    const interval = config.intervalSlots.find(slot => slot.afterPeriod === period);
    if (!interval) return null;
    
    const startTime = calculateTime(period + 1);
    return {
      duration: interval.duration,
      startTime,
    };
  };

  // Render a single timetable page for an entity
  const renderTimetablePage = (entity: TimetableEntity) => {
    const hasIntervalAfter = (period: number): boolean => {
      return config.intervalSlots.some(slot => slot.afterPeriod === period);
    };

    return (
      <Page key={entity.id} size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          {schoolAddress && (
            <Text style={styles.schoolAddress}>{schoolAddress}</Text>
          )}
          <Text style={styles.versionName}>Timetable Version: {versionName}</Text>
          <Text style={styles.mainTitle}>
            {type === 'class' ? entity.name : `${entity.name} - Schedule`}
          </Text>
        </View>

        {/* Timetable Grid */}
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableRow}>
            <View style={[styles.periodCol, { width: periodColWidth }]}>
              <Text style={styles.headerText}>Period</Text>
            </View>
            {showTimeColumn && (
              <View style={[styles.timeCol, { width: timeColWidth }]}>
                <Text style={styles.headerText}>Time</Text>
              </View>
            )}
            {DAYS.map((day, index) => (
              <View 
                key={day} 
                style={[
                  index === DAYS.length - 1 ? styles.tableColHeaderLast : styles.tableColHeader,
                  { width: dayColWidth }
                ]}
              >
                <Text style={styles.headerText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Period Rows */}
          {Array.from({ length: Math.max(config.numberOfPeriods, Math.max(...slots.map(s => Number(s.periodNumber)), 0)) }, (_, i) => i + 1).map((period) => {
            const intervalInfo = hasIntervalAfter(period) ? getIntervalInfo(period) : null;
            const isLastPeriod = period === config.numberOfPeriods && !intervalInfo;
            
            return (
              <React.Fragment key={`period-${period}`}>
                {/* Period Row */}
                <View style={isLastPeriod ? styles.tableRowLast : styles.tableRow}>
                  <View style={[styles.periodCol, { width: periodColWidth }]}>
                    <Text style={styles.cellText}>{period}</Text>
                  </View>
                  {showTimeColumn && (
                    <View style={[styles.timeCol, { width: timeColWidth }]}>
                      <Text style={styles.cellTextSmall}>
                        {calculateTime(period)}
                      </Text>
                    </View>
                  )}
                  {DAYS.map((day, dayIndex) => {
                    const slot = getSlotForPeriod(day, period, entity.id);
                    const isDoubleStart = slot?.isDoubleStart || false;
                    const isDoubleEnd = slot?.isDoubleEnd || false;
                    const isDoublePeriod = isDoubleStart || isDoubleEnd;

                    const displayText = getSlotDisplayText(slot);

                    return (
                      <View 
                        key={`${day}-${period}`} 
                        style={[
                          dayIndex === DAYS.length - 1 ? styles.dayColLast : styles.dayCol,
                          { width: dayColWidth }
                        ]}
                      >
                        {displayText ? (
                          isDoublePeriod ? (
                            <>
                              <Text style={styles.cellTextBold}>{displayText}</Text>
                              <Text style={styles.doublePeriodLabel}>(Double Period)</Text>
                            </>
                          ) : (
                            <Text style={styles.cellText}>{displayText}</Text>
                          )
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {/* Interval Row */}
                {intervalInfo && (
                  <View style={styles.intervalRow}>
                    <View style={styles.intervalCell}>
                      <Text style={styles.intervalText}>
                        INTERVAL — {intervalInfo.duration} minutes (from {intervalInfo.startTime})
                      </Text>
                    </View>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Signature Section */}
        {(showPrincipalSignature || showClassTeacherSignature) && (
          <View style={styles.signatureSection}>
            {showPrincipalSignature && (
              <View style={styles.signatureBox}>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureText}>Principal Signature</Text>
                </View>
              </View>
            )}
            {showClassTeacherSignature && (
              <View style={styles.signatureBox}>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureText}>Class Teacher Signature</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Footer with Logo */}
        <View style={styles.footer} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            src="/logo.png"
            style={styles.footerLogo}
          />
          <Text style={styles.footerText}>
            Powered by EduFlow AI — Intelligent School Scheduling — {currentDate}
          </Text>
        </View>
      </Page>
    );
  };

  return (
    <Document>
      {entities.map(entity => renderTimetablePage(entity))}
    </Document>
  );
};

export default TimetablePDF;
