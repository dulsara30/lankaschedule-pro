import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Pure black and white styles - professional and clean
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 30,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '1pt solid #000000',
    paddingBottom: 10,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000000',
  },
  entityName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#000000',
  },
  versionName: {
    fontSize: 10,
    color: '#000000',
    marginBottom: 3,
  },
  generatedDate: {
    fontSize: 8,
    color: '#000000',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 0.5,
    borderColor: '#000000',
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    minHeight: 25,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 25,
  },
  tableColHeader: {
    width: '12%',
    borderRightWidth: 0.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#F5F5F5',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableColHeaderLast: {
    width: '12%',
    backgroundColor: '#F5F5F5',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCol: {
    width: '12%',
    borderRightWidth: 0.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableColLast: {
    width: '12%',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodCol: {
    width: '8%',
    borderRightWidth: 0.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#F5F5F5',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeCol: {
    width: '12%',
    borderRightWidth: 0.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    backgroundColor: '#F5F5F5',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCol: {
    width: '16%',
    borderRightWidth: 0.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    padding: 5,
    justifyContent: 'center',
  },
  dayColLast: {
    width: '16%',
    padding: 5,
    justifyContent: 'center',
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
  cellTextSmall: {
    fontSize: 8,
    color: '#000000',
    textAlign: 'center',
  },
  doublePeriodCell: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doublePeriodText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  intervalRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    minHeight: 20,
    backgroundColor: '#F5F5F5',
  },
  intervalCell: {
    width: '100%',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intervalText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
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

interface TimetablePDFProps {
  type: 'class' | 'teacher';
  entityName: string;
  versionName: string;
  slots: TimetableSlot[];
  config: SchoolConfig;
  lessonNameMap: Record<string, string>;
  schoolName?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TimetablePDF: React.FC<TimetablePDFProps> = ({
  type,
  entityName,
  versionName,
  slots,
  config,
  lessonNameMap,
  schoolName = 'LankaSchedule Pro',
}) => {
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
    if (type === 'class') {
      return slots.find(
        slot => slot.day === day && 
                slot.periodNumber === period && 
                slot.classId?._id === entityId
      );
    } else {
      // For teacher view, find slots where this teacher is assigned
      return slots.find(
        slot => slot.day === day && 
                slot.periodNumber === period &&
                slot.lessonId?.teacherIds?.some((teacher: Teacher) => teacher._id === entityId)
      );
    }
  };

  // Get the display text for a slot
  const getSlotDisplayText = (slot: TimetableSlot | undefined): string => {
    if (!slot || !slot.lessonId) return '';
    
    const lessonName = lessonNameMap[slot.lessonId._id] || slot.lessonId.lessonName;
    
    if (type === 'teacher' && slot.classId) {
      // For teacher view, show "LessonName - ClassName"
      return `${lessonName} - ${slot.classId.name}`;
    }
    
    // For class view, show only lesson name
    return lessonName;
  };

  // Check if period has an interval after it
  const hasIntervalAfter = (period: number): boolean => {
    return config.intervalSlots.some(slot => slot.afterPeriod === period);
  };

  // Get interval duration and time
  const getIntervalInfo = (period: number): { duration: number; startTime: string } | null => {
    const interval = config.intervalSlots.find(slot => slot.afterPeriod === period);
    if (!interval) return null;
    
    const startTime = calculateTime(period + 1);
    return {
      duration: interval.duration,
      startTime,
    };
  };

  // For bulk export, we need the entity ID - extract from first matching slot
  const entityId = type === 'class' 
    ? slots.find(s => s.classId)?.classId._id || ''
    : slots.find(s => s.lessonId?.teacherIds?.length)?.lessonId.teacherIds[0]._id || '';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.entityName}>
            {type === 'class' ? `Class: ${entityName}` : `Teacher: ${entityName}`}
          </Text>
          <Text style={styles.versionName}>Version: {versionName}</Text>
          <Text style={styles.generatedDate}>
            Generated on: {new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </View>

        {/* Timetable */}
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableRow}>
            <View style={styles.periodCol}>
              <Text style={styles.headerText}>Period</Text>
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.headerText}>Time</Text>
            </View>
            {DAYS.map((day, index) => (
              <View key={day} style={index === DAYS.length - 1 ? styles.dayColLast : styles.dayCol}>
                <Text style={styles.headerText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Period Rows */}
          {Array.from({ length: config.numberOfPeriods }, (_, i) => i + 1).map((period) => {
            const intervalInfo = hasIntervalAfter(period) ? getIntervalInfo(period) : null;
            
            return (
              <React.Fragment key={`period-${period}`}>
                {/* Period Row */}
                <View style={intervalInfo ? styles.tableRow : styles.tableRowLast}>
                  <View style={styles.periodCol}>
                    <Text style={styles.cellText}>{period}</Text>
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={styles.cellTextSmall}>
                      {calculateTime(period)}
                    </Text>
                  </View>
                  {DAYS.map((day, dayIndex) => {
                    const slot = getSlotForPeriod(day, period, entityId);
                    const isDoubleStart = slot?.isDoubleStart || false;
                    const isDoubleEnd = slot?.isDoubleEnd || false;

                    // Skip rendering if this is the END of a double period
                    if (isDoubleEnd) {
                      return null;
                    }

                    const displayText = getSlotDisplayText(slot);

                    return (
                      <View 
                        key={`${day}-${period}`} 
                        style={dayIndex === DAYS.length - 1 ? styles.dayColLast : styles.dayCol}
                      >
                        {isDoubleStart ? (
                          <View style={styles.doublePeriodCell}>
                            <Text style={styles.doublePeriodText}>{displayText}</Text>
                            <Text style={styles.cellTextSmall}>(Double Period)</Text>
                          </View>
                        ) : (
                          <Text style={styles.cellText}>{displayText}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Interval Row */}
                {intervalInfo && (
                  <View style={styles.intervalRow}>
                    <View style={styles.intervalCell}>
                      <Text style={styles.intervalText}>
                        INTERVAL - {intervalInfo.duration} minutes (from {intervalInfo.startTime})
                      </Text>
                    </View>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
      </Page>
    </Document>
  );
};

export default TimetablePDF;
