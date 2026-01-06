'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles, X, ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveTimetableResults } from '@/app/actions/asyncTimetableGeneration';

interface JobStatus {
  jobId: string;
  status: 'starting' | 'processing' | 'completed' | 'failed';
  progress: string;
  createdAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  placedCount?: number;
  totalCount?: number;
}

export default function FloatingSolverStatus() {
  const router = useRouter();
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Use ref to prevent duplicate saves and track interval
  const isSavingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for job status
  useEffect(() => {
    const checkJob = async () => {
      // Check localStorage for active job
      const storedJobId = localStorage.getItem('activeGenerationJobId');
      if (!storedJobId || isDismissed) return;

      try {
        const response = await fetch(`http://127.0.0.1:8000/job-status/${storedJobId}`);
        if (!response.ok) {
          // Job not found - clear localStorage and stop polling
          localStorage.removeItem('activeGenerationJobId');
          setIsVisible(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        const status: JobStatus = await response.json();
        setJobStatus(status);
        setIsVisible(true);

        // CRITICAL: If completed, IMMEDIATELY stop polling and save ONCE
        if (status.status === 'completed' && !isSavingRef.current) {
          console.log('✅ Job completed - stopping polling and auto-saving results...');
          
          // STOP POLLING IMMEDIATELY
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          
          // Mark as saving to prevent duplicates
          isSavingRef.current = true;
          setIsSaving(true);
          
          try {
            const versionName = localStorage.getItem('generationVersionName') || `Draft v${Date.now()}`;
            const saveResult = await saveTimetableResults(storedJobId, versionName);
            
            if (saveResult.success) {
              toast.success('🎉 Timetable saved successfully!', {
                duration: 6000,
                description: `${saveResult.slotsPlaced} slots placed with ${saveResult.conflicts} conflicts`
              });
              
              // Clear job ID after successful save
              localStorage.removeItem('activeGenerationJobId');
            } else {
              toast.error('Failed to save timetable', {
                description: saveResult.message
              });
            }
          } catch (error) {
            console.error('Failed to save results:', error);
            toast.error('Failed to save timetable results');
          } finally {
            setIsSaving(false);
          }
        }

        // If failed, show error and stop polling
        if (status.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          toast.error('Generation failed', {
            description: status.error,
            duration: 8000
          });
        }
      } catch (error: any) {
        console.error('Failed to fetch job status:', error);
        
        // Handle connection refused (solver not running)
        if (error.message?.includes('Failed to fetch') || error.code === 'ECONNREFUSED') {
          // Keep the status bar visible with connection lost message
          if (jobStatus) {
            setJobStatus({
              ...jobStatus,
              progress: '⏳ Connection lost. Retrying...'
            });
          }
        }
      }
    };

    // Initial check
    checkJob();

    // Poll every 3 seconds for more responsive updates
    intervalRef.current = setInterval(checkJob, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isDismissed]); // Only re-run if isDismissed changes

  const handleDismiss = () => {
    localStorage.removeItem('activeGenerationJobId');
    setIsDismissed(true);
    setIsVisible(false);
  };

  const handleViewResults = () => {
    handleDismiss();
    router.push('/dashboard/timetable');
    router.refresh();
  };

  const calculateProgress = () => {
    if (!jobStatus) return 0;
    if (jobStatus.status === 'completed') return 100;
    if (jobStatus.placedCount && jobStatus.totalCount) {
      return Math.round((jobStatus.placedCount / jobStatus.totalCount) * 100);
    }
    // Estimate based on status
    if (jobStatus.status === 'starting') return 5;
    if (jobStatus.status === 'processing') return 50;
    return 0;
  };

  if (!isVisible || !jobStatus) return null;

  const progress = calculateProgress();
  const isComplete = jobStatus.status === 'completed';
  const isFailed = jobStatus.status === 'failed';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <Card className="w-96 shadow-2xl border-2 border-purple-200 dark:border-purple-800 bg-white dark:bg-zinc-900">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {!isComplete && !isFailed && (
                <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
              )}
              {isComplete && (
                <Sparkles className="h-5 w-5 text-green-500" />
              )}
              {isFailed && (
                <X className="h-5 w-5 text-red-500" />
              )}
              <h3 className="font-semibold text-sm">
                {isComplete ? 'Timetable Ready!' : isFailed ? 'Generation Failed' : 'Generating Timetable...'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress Bar */}
          {!isFailed && (
            <div className="mb-3">
              <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out relative overflow-hidden"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {progress}% Complete
                </span>
                {jobStatus.placedCount && jobStatus.totalCount && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {jobStatus.placedCount}/{jobStatus.totalCount} slots
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Status Message */}
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            {isFailed ? jobStatus.error : jobStatus.progress}
          </p>

          {/* Action Buttons */}
          {isComplete && !isSaving && (
            <Button
              onClick={handleViewResults}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              size="sm"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Timetable
            </Button>
          )}

          {isComplete && isSaving && (
            <Button
              disabled
              className="w-full"
              size="sm"
            >
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </Button>
          )}

          {isFailed && (
            <Button
              onClick={handleDismiss}
              variant="outline"
              className="w-full"
              size="sm"
            >
              Dismiss
            </Button>
          )}

          {!isComplete && !isFailed && (
            <div className="text-xs text-center text-gray-500 dark:text-gray-500">
              <p>💡 You can navigate away - generation continues in background</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
