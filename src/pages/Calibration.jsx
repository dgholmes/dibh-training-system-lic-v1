import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, RefreshCw, AlertOctagon, Info, Bluetooth, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { PatientFlowPageHeader } from '@/components/common/PatientFlowPageHeader';
import { Patient, CalibrationSession } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import StepIndicator from '@/components/common/StepIndicator';
import BreathingChart from '@/components/common/BreathingChart';
import CalibrationChart from '@/components/common/CalibrationChart';
import EmergencyStopModal from '@/components/common/EmergencyStopModal';
import {
  Stage1EnsembleRTAnalyzer,
  Stage2Detector,
  Stage3Detector,
  OnePoleLPF,
  DerivativeEstimator,
  determineDibhType,
} from '@/lib/calibration';
import { cn } from '@/lib/utils';
import { useGoDirect } from '@/context/GoDirectContext';

const STAGES = [
  { name: '평상시 호흡 측정', duration: 10, progressRange: [0, 33.33] },
  { name: '심호흡 측정', duration: 10, progressRange: [33.33, 66.66] },
  { name: 'DIBH 유지 측정', duration: 10, progressRange: [66.66, 100] }
];

const REST_DURATION = 3; // 30 seconds rest between stages
const COUNTDOWN_DURATION = 5; // 5 seconds countdown before starting

export default function Calibration() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');

  // GoDirect Bluetooth connection for real sensor data
  const { connected, latest, startReading } = useGoDirect();

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => {
      const results = Patient.filter({ id: patientId });
      return results[0] || null;
    },
    enabled: !!patientId,
  });

  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [stageProgress, setStageProgress] = useState(0); // Progress within current stage (0-100)
  const [overallProgress, setOverallProgress] = useState(0); // Overall calibration progress (0-100)
  const [accuracy, setAccuracy] = useState(89);
  const [isResting, setIsResting] = useState(false);
  const [restTimeRemaining, setRestTimeRemaining] = useState(0);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isCountdown, setIsCountdown] = useState(true);
  const [countdownTime, setCountdownTime] = useState(COUNTDOWN_DURATION);
  const [sessionId, setSessionId] = useState(null);
  const [completedStages, setCompletedStages] = useState([]);
  const [stageData, setStageData] = useState({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [stage1Annotation, setStage1Annotation] = useState({
    cycles: [],
    rise_starts: [],
    fall_starts: [],
    hi: null,
    lo: null,
  });
  const [stage2Annotation, setStage2Annotation] = useState({
    baseline_marks: [],
    start_marks: [],
    peak_marks: [],
    phase: 'IDLE',
    attempt_idx: 0,
    prompt: null,
  });
  const [stage2AvgAmp, setStage2AvgAmp] = useState(null);
  const [stage2LiveAttempts, setStage2LiveAttempts] = useState([]);
  const [stage3LiveAttempts, setStage3LiveAttempts] = useState([]);
  const [stage3Annotation, setStage3Annotation] = useState({
    hold_th: null,
    release_th: null,
    target_th: null,
    hold_start_t: null,
    hold_end_t: null,
    phase: 'IDLE',
    attempt_idx: 0,
    last_rep_peak: null,
  });
  const intervalRef = useRef(null);
  const restIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const stage1Ref = useRef(null);
  const stage2Ref = useRef(null);
  const stage3Ref = useRef(null);
  const yLpfRef = useRef(null);
  const dyEstRef = useRef(null);

  // Calculate overall progress from completed stages and current stage progress
  const calculateOverallProgress = (stageIdx, stageProg, completed = []) => {
    // Calculate progress from completed stages
    let completedProgress = 0;
    completed.forEach(completedIdx => {
      const stage = STAGES[completedIdx];
      completedProgress += (stage.progressRange[1] - stage.progressRange[0]);
    });
    
    // Add current stage progress
    if (stageIdx < STAGES.length) {
      const stageStart = STAGES[stageIdx].progressRange[0];
      const stageEnd = STAGES[stageIdx].progressRange[1];
      const stageRange = stageEnd - stageStart;
      completedProgress += (stageProg / 100) * stageRange;
    }
    
    return completedProgress;
  };

  // Initialize or resume calibration session
  useEffect(() => {
    if (!patientId || isCountdown) return;

    // Check for existing in-progress session
    const existingSessions = CalibrationSession.filter({ 
      patient_id: patientId, 
      status: 'in_progress' 
    });
    
    if (existingSessions.length > 0) {
      const session = existingSessions[0];
      setSessionId(session.id);
      setCurrentStageIndex(session.current_stage_index || 0);
      setCompletedStages(session.completed_stages || []);
      setStageData(session.stage_data || {});
      
      // Calculate overall progress from completed stages
      const overall = calculateOverallProgress(
        session.current_stage_index || 0,
        0,
        session.completed_stages || []
      );
      setOverallProgress(overall);
      
      // Current stage always starts at 0% (can't resume mid-stage)
      setStageProgress(0);
      setChartData([]);
    } else {
      // Create new session
      const newSession = CalibrationSession.create({
        patient_id: patientId,
        status: 'in_progress',
        current_stage_index: 0,
        completed_stages: [],
        stage_data: {},
        overall_accuracy: 89,
      });
      setSessionId(newSession.id);
      setCurrentStageIndex(0);
      setCompletedStages([]);
      setStageData({});
      setStageProgress(0);
      setOverallProgress(0);
      setChartData([]);
    }
  }, [patientId, isCountdown]);

  // Ensure sensor is reading when calibration starts
  useEffect(() => {
    if (connected && !isCountdown && !isResting && !isCompleted) {
      startReading();
    }
  }, [connected, isCountdown, isResting, isCompleted, startReading]);

  // Capture sensor data and drive Stage 1 algorithm when on stage 0
  useEffect(() => {
    if (!connected || isCountdown || isResting || isCompleted || isPaused) return;
    if (typeof latest !== 'number') return;

    const now = Date.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    }
    const t = (now - startTimeRef.current) / 1000;

    // Stage 1 (index 0): drive analyzer and set chart + progress from it
    if (currentStageIndex === 0 && stage1Ref.current?.running) {
      stage1Ref.current.update(t, latest);
      const s1 = stage1Ref.current;
      const okCount = s1.cycles.filter((c) => c.ok).length;
      const prog = Math.min(100, (okCount / 10) * 100);
      setStageProgress(prog);
      setOverallProgress(calculateOverallProgress(0, prog, completedStages));
      setStage1Annotation({
        cycles: [...s1.cycles],
        rise_starts: [...s1.rise_starts],
        fall_starts: [...s1.fall_starts],
        hi: s1.hi,
        lo: s1.lo,
      });
      setChartData(() => {
        const len = s1.t_buf.length;
        if (len === 0) return [];
        return s1.t_buf.map((time, i) => ({
          time,
          value: s1.raw_buf[i],
          filtered: s1.y_buf[i],
        })).slice(-400);
      });

      if (s1.is_done() && sessionId) {
        const cv = s1.get_cv();
        const cvPeriod = s1.get_cv_period();
        const updatedCompletedStages = [...completedStages, 0];
        const updatedStageData = {
          ...stageData,
          [0]: {
            breath_samples: stage1Ref.current.t_buf.map((time, i) => ({
              time,
              value: stage1Ref.current.raw_buf[i],
              filtered: stage1Ref.current.y_buf[i],
            })),
            cv: cv ?? undefined,
            cv_period: cvPeriod ?? undefined,
            ok_cycles_count: stage1Ref.current.cycles.filter((c) => c.ok).length,
            completed_at: new Date().toISOString(),
          },
        };
        CalibrationSession.update(sessionId, {
          completed_stages: updatedCompletedStages,
          stage_data: updatedStageData,
          current_stage_index: 1,
          overall_accuracy: accuracy,
        });
        setCompletedStages(updatedCompletedStages);
        setStageData(updatedStageData);
        setIsResting(true);
        setRestTimeRemaining(REST_DURATION);
        setStageProgress(100);
      }
      return;
    }

    // Stage 2 (index 1): drive detector
    if (currentStageIndex === 1 && stage2Ref.current?.running) {
      stage2Ref.current.update(t, latest);
      const s2 = stage2Ref.current;
      const prog = s2.reps > 0 ? Math.min(100, (s2.attempt_results.length / s2.reps) * 100) : 0;
      setStageProgress(prog);
      setOverallProgress(calculateOverallProgress(1, prog, completedStages));
      setStage2Annotation({
        baseline_marks: [...s2.baseline_marks],
        start_marks: [...s2.start_marks],
        peak_marks: [...s2.peak_marks],
        phase: s2.phase,
        attempt_idx: s2.attempt_idx,
        prompt: s2.prompt ?? null,
      });
      setStage2LiveAttempts([...s2.attempt_results]);
      setChartData(() => {
        const len = s2.ts.length;
        if (len === 0) return [];
        return s2.ts.map((time, i) => ({
          time,
          value: s2.raw[i],
          filtered: s2.filt[i],
        })).slice(-400);
      });

      if (s2.is_done() && sessionId) {
        const avgAmp = s2.get_avg_amp();
        const maxAmp = s2.get_max_amp();
        const minAmp = s2.get_min_amp();
        setStage2AvgAmp(avgAmp);
        const updatedCompletedStages = [...completedStages, 1];
        const updatedStageData = {
          ...stageData,
          [1]: {
            attempt_results: s2.attempt_results,
            max_amp: maxAmp ?? undefined,
            avg_amp: avgAmp ?? undefined,
            min_amp: minAmp ?? undefined,
            completed_at: new Date().toISOString(),
          },
        };
        CalibrationSession.update(sessionId, {
          completed_stages: updatedCompletedStages,
          stage_data: updatedStageData,
          current_stage_index: 2,
          overall_accuracy: accuracy,
        });
        setCompletedStages(updatedCompletedStages);
        setStageData(updatedStageData);
        setIsResting(true);
        setRestTimeRemaining(REST_DURATION);
        setStageProgress(100);
      }
      return;
    }

    // Stage 3 (index 2): drive detector with y_f and dy_s
    if (currentStageIndex === 2 && stage3Ref.current?.session_running && yLpfRef.current && dyEstRef.current) {
      const y_f = yLpfRef.current.update(t, latest);
      const [, dy_s] = dyEstRef.current.update(t, y_f);
      stage3Ref.current.update(t, y_f, dy_s);
      const s3 = stage3Ref.current;
      const prog = s3.reps > 0 ? Math.min(100, (s3.attempts.length / s3.reps) * 100) : 0;
      setStageProgress(prog);
      setOverallProgress(calculateOverallProgress(2, prog, completedStages));
      const curAttempt = s3.attempts[s3.attempt_idx - 1];
      setStage3Annotation((prev) => ({
        hold_th: s3.hold_th,
        release_th: s3.release_th,
        target_th: s3.target_th,
        hold_start_t: curAttempt?.hold_start_t ?? null,
        hold_end_t: curAttempt?.hold_end_t ?? null,
        phase: s3.phase,
        attempt_idx: s3.attempt_idx,
        last_rep_peak: curAttempt?.rep_peak_val ?? prev.last_rep_peak ?? null,
      }));
      setStage3LiveAttempts([...s3.attempts]);
      setChartData(prev => {
        const newPoint = { time: parseFloat(t.toFixed(1)), value: latest, filtered: y_f };
        return [...prev.slice(-399), newPoint];
      });

      if (s3.is_done() && sessionId) {
        const avg_dibh = s3.get_avg_dibh();
        const avg_hold_quality = s3.get_avg_hold_quality_pct();
        const cv = stageData[0]?.cv ?? null;
        const training_type = determineDibhType(avg_dibh ?? 0, cv ?? 0) ?? 'B';
        const updatedCompletedStages = [...completedStages, 2];
        const updatedStageData = {
          ...stageData,
          [2]: {
            attempts: s3.attempts,
            avg_dibh: avg_dibh ?? undefined,
            avg_hold_quality_pct: avg_hold_quality ?? undefined,
            completed_at: new Date().toISOString(),
          },
        };
        const algorithm_results = {
          stage1: {
            cv: stageData[0]?.cv,
            cv_period: stageData[0]?.cv_period,
            ok_cycles_count: stageData[0]?.ok_cycles_count,
          },
          stage2: {
            max_amp: stageData[1]?.max_amp,
            avg_amp: stageData[1]?.avg_amp,
            min_amp: stageData[1]?.min_amp,
            attempt_results: stageData[1]?.attempt_results,
          },
          stage3: {
            avg_dibh: avg_dibh,
            attempts: s3.attempts,
            avg_hold_quality_pct: avg_hold_quality,
          },
        };
        CalibrationSession.update(sessionId, {
          completed_stages: updatedCompletedStages,
          stage_data: updatedStageData,
          current_stage_index: 2,
        });
        CalibrationSession.complete(sessionId, {
          training_type,
          dibh_duration: Math.round(avg_dibh ?? 0),
          cv: Math.round(cv ?? 0),
          algorithm_results,
        });
        setCompletedStages(updatedCompletedStages);
        setStageData(updatedStageData);
        setIsCompleted(true);
        setSessionId(null);
        setTimeout(() => {
          navigate(createPageUrl('TypeDecision') + `?patientId=${patientId}`);
        }, 1000);
      }
      return;
    }

    setChartData(prev => {
      const newPoint = { time: parseFloat(t.toFixed(1)), value: latest };
      return [...prev.slice(-399), newPoint];
    });
  }, [latest, connected, isCountdown, isResting, isCompleted, isPaused, currentStageIndex, sessionId, completedStages, stageData, accuracy, stage2AvgAmp, patientId, navigate]);

  // Reset start time when entering a new stage (after rest or initial)
  useEffect(() => {
    if (isResting || isCountdown) return;
    startTimeRef.current = Date.now();
  }, [currentStageIndex, isResting, isCountdown]);

  // Stage 1: start analyzer when countdown ends and we're on stage 0
  useEffect(() => {
    if (isCountdown || currentStageIndex !== 0) return;
    if (!stage1Ref.current) {
      stage1Ref.current = new Stage1EnsembleRTAnalyzer();
    }
    stage1Ref.current.reset();
    stage1Ref.current.start(0);
    startTimeRef.current = Date.now();
  }, [isCountdown, currentStageIndex]);

  // Stage 2: start detector when we enter stage index 1 (after rest)
  useEffect(() => {
    if (isResting || isCountdown || currentStageIndex !== 1) return;
    if (!stage2Ref.current) {
      stage2Ref.current = new Stage2Detector();
    }
    stage2Ref.current.reset();
    const t = startTimeRef.current != null ? (Date.now() - startTimeRef.current) / 1000 : 0;
    stage2Ref.current.begin(t);
  }, [currentStageIndex, isResting, isCountdown]);

  // Stage 3: start detector and LPF/derivative when we enter stage index 2 (after rest)
  useEffect(() => {
    if (isResting || isCountdown || currentStageIndex !== 2) return;
    const avgAmp = stage2AvgAmp ?? 20;
    // Match Python: y_lpf = OnePoleLPF(1.2), dy_est = DerivativeEstimator(1.8)
    if (!yLpfRef.current) {
      yLpfRef.current = new OnePoleLPF(1.2);
    }
    yLpfRef.current.reset();
    if (!dyEstRef.current) {
      dyEstRef.current = new DerivativeEstimator(1.8);
    }
    dyEstRef.current.reset();
    if (!stage3Ref.current) {
      stage3Ref.current = new Stage3Detector(avgAmp);
    }
    stage3Ref.current.reset();
    const t = startTimeRef.current != null ? (Date.now() - startTimeRef.current) / 1000 : 0;
    stage3Ref.current.start(t);
  }, [currentStageIndex, isResting, isCountdown, stage2AvgAmp]);

  // Countdown timer on mount and restart
  useEffect(() => {
    if (!isCountdown) return;

    countdownIntervalRef.current = setInterval(() => {
      setCountdownTime(prev => {
        if (prev <= 1) {
          setIsCountdown(false);
          setCountdownTime(COUNTDOWN_DURATION);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [isCountdown]);

  // Main calibration progress (Stage 2 & 3 only; Stage 1 is algorithm-driven)
  useEffect(() => {
    if (isPaused || isResting || overallProgress >= 100 || isCountdown || isCompleted) {
      return;
    }
    if (currentStageIndex === 0 || currentStageIndex === 1 || currentStageIndex === 2) return;

    intervalRef.current = setInterval(() => {
      setStageProgress(prev => {
        const newStageProgress = Math.min(100, prev + (100 / STAGES[currentStageIndex].duration));
        
        // Calculate overall progress
        const newOverall = calculateOverallProgress(currentStageIndex, newStageProgress, completedStages);
        setOverallProgress(newOverall);

        // If stage is complete, save stage data and start rest period
        if (newStageProgress >= 100) {
          // Save completed stage data
          if (sessionId) {
            const updatedCompletedStages = [...completedStages, currentStageIndex];
            const updatedStageData = {
              ...stageData,
              [currentStageIndex]: {
                breath_samples: [...chartData], // Save collected breath wave samples
                accuracy: accuracy,
                completed_at: new Date().toISOString()
              }
            };
            
            CalibrationSession.update(sessionId, {
              completed_stages: updatedCompletedStages,
              stage_data: updatedStageData,
              current_stage_index: currentStageIndex + 1,
              overall_accuracy: accuracy,
            });
            
            setCompletedStages(updatedCompletedStages);
            setStageData(updatedStageData);
          }
          
          // Check if this is the last stage
          if (currentStageIndex === STAGES.length - 1) {
            // Mark as completed to prevent further updates
            setIsCompleted(true);
            
            // Calibration complete - convert session to Calibration record
            if (sessionId) {
              try {
                // Calculate final results (this would come from algorithm in real implementation)
                const finalResults = {
                  training_type: 'A', // This would be determined by algorithm
                  dibh_duration: 45, // This would come from algorithm analysis
                  cv: 12, // Coefficient of variation from algorithm
                  algorithm_results: stageData
                };
                
                CalibrationSession.complete(sessionId, finalResults);
                setSessionId(null); // Clear session ID after completion
              } catch (error) {
                console.error('Error completing calibration session:', error);
              }
            }
            
            // Clear interval and navigate to TypeDecision
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            
            setTimeout(() => {
              navigate(createPageUrl('TypeDecision') + `?patientId=${patientId}`);
            }, 1000);
            return 100;
          } else {
            // Start rest period
            setIsResting(true);
            setRestTimeRemaining(REST_DURATION);
            return 100;
          }
        }

        return newStageProgress;
      });

      // Update accuracy (this would be calculated from real data in production)
      setAccuracy(prev => Math.min(100, Math.max(80, prev + (Math.random() - 0.5) * 2)));

      // Only generate simulated data if NOT connected to real belt (for testing)
      if (!connected) {
        setChartData(prev => {
          const newPoint = {
            time: prev.length,
            value: Math.sin(prev.length * 0.3) * 30 + 50 + Math.random() * 10,
          };
          return [...prev.slice(-60), newPoint];
        });
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentStageIndex, isPaused, isResting, overallProgress, patientId, navigate, completedStages, connected]);

  // Update session with current progress (for tracking, not for resumption)
  useEffect(() => {
    if (sessionId && !isCountdown && !isResting) {
      // Update session with current state (for tracking purposes)
      // Note: We can't resume mid-stage, but this helps with tracking
      CalibrationSession.update(sessionId, {
        current_stage_index: currentStageIndex,
        overall_accuracy: accuracy,
        updated_at: new Date().toISOString(),
      });
    }
  }, [sessionId, currentStageIndex, accuracy, isCountdown, isResting]);

  // Rest period countdown
  useEffect(() => {
    if (!isResting) return;

    restIntervalRef.current = setInterval(() => {
      setRestTimeRemaining(prev => {
        if (prev <= 1) {
          // Rest period over, move to next stage
          setIsResting(false);
          setCurrentStageIndex(prevIdx => {
            const nextIdx = prevIdx + 1;
            setStageProgress(0);
            setChartData([]); // Clear chart data for new stage
            
            // Update session with new current stage
            if (sessionId) {
              CalibrationSession.update(sessionId, {
                current_stage_index: nextIdx,
              });
            }
            
            return nextIdx;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (restIntervalRef.current) {
        clearInterval(restIntervalRef.current);
      }
    };
  }, [isResting]);

  const handleEmergencyStop = () => {
    // Delete the session on emergency stop
    if (sessionId) {
      CalibrationSession.delete(sessionId);
    }
              navigate(createPageUrl('Home'));
  };

  const handleRestartCurrentStage = () => {
    // Clear current stage data from session (if it exists)
    if (sessionId) {
      const updatedStageData = { ...stageData };
      delete updatedStageData[currentStageIndex];
      
      CalibrationSession.update(sessionId, {
        stage_data: updatedStageData,
      });
      
      setStageData(updatedStageData);
    }
    
    if (currentStageIndex === 0 && stage1Ref.current) {
      stage1Ref.current.reset();
      setStage1Annotation({ cycles: [], rise_starts: [], fall_starts: [], hi: null, lo: null });
    }
    if (currentStageIndex === 1 && stage2Ref.current) {
      stage2Ref.current.reset();
      setStage2Annotation({
        baseline_marks: [],
        start_marks: [],
        peak_marks: [],
        phase: 'IDLE',
        attempt_idx: 0,
        prompt: null,
      });
      setStage2LiveAttempts([]);
    }
    if (currentStageIndex === 2 && stage3Ref.current) {
      stage3Ref.current.reset();
      yLpfRef.current?.reset();
      dyEstRef.current?.reset();
      setStage3Annotation({
        hold_th: null,
        release_th: null,
        target_th: null,
        hold_start_t: null,
        hold_end_t: null,
        phase: 'IDLE',
        attempt_idx: 0,
        last_rep_peak: null,
      });
      setStage3LiveAttempts([]);
    }
    
    // Reset current stage progress
    setStageProgress(0);
    setChartData([]); // Clear breath samples for current stage
    setIsResting(false);
    setRestTimeRemaining(0);
    setIsPaused(false);
    setIsCountdown(true);
    setCountdownTime(COUNTDOWN_DURATION);
    
    // Recalculate overall progress from completed stages only
    const newOverall = calculateOverallProgress(currentStageIndex, 0, completedStages);
    setOverallProgress(newOverall);
  };

  const handleRestartAll = () => {
    // Delete existing session and create a new one
    if (sessionId) {
      CalibrationSession.delete(sessionId);
    }
    
    // Create new session
    if (patientId) {
      const newSession = CalibrationSession.create({
        patient_id: patientId,
        status: 'in_progress',
        current_stage_index: 0,
        completed_stages: [],
        stage_data: {},
        overall_accuracy: 89,
      });
      setSessionId(newSession.id);
    }
    
    // Reset all state
    setCurrentStageIndex(0);
    setStageProgress(0);
    setOverallProgress(0);
    setAccuracy(89);
    setIsResting(false);
    setRestTimeRemaining(0);
    setIsPaused(false);
    setChartData([]);
    setCompletedStages([]);
    setStageData({});
    setStage1Annotation({ cycles: [], rise_starts: [], fall_starts: [], hi: null, lo: null });
    setStage2Annotation({
      baseline_marks: [],
      start_marks: [],
      peak_marks: [],
      phase: 'IDLE',
      attempt_idx: 0,
      prompt: null,
    });
    setStage2AvgAmp(null);
    setStage2LiveAttempts([]);
    setStage3LiveAttempts([]);
    setStage3Annotation({
      hold_th: null,
      release_th: null,
      target_th: null,
      hold_start_t: null,
      hold_end_t: null,
      phase: 'IDLE',
      attempt_idx: 0,
      last_rep_peak: null,
    });
    setIsCountdown(true);
    setCountdownTime(COUNTDOWN_DURATION);
  };

  const currentStage = STAGES[currentStageIndex];

  // Stage 2/3 display averages for compact card
  const stage2DisplayAvg = useMemo(() => {
    if (stageData[1]?.avg_amp != null) return stageData[1].avg_amp;
    const arr = stage2LiveAttempts.filter((a) => a.amp != null);
    return arr.length ? arr.reduce((s, a) => s + (a.amp ?? 0), 0) / arr.length : null;
  }, [stageData[1]?.avg_amp, stage2LiveAttempts]);

  const stage3DisplayAvg = useMemo(() => {
    if (stageData[2]?.avg_dibh != null) return stageData[2].avg_dibh;
    const arr = stage3LiveAttempts.filter((a) => a.hold_duration != null);
    return arr.length ? arr.reduce((s, a) => s + a.hold_duration, 0) / arr.length : null;
  }, [stageData[2]?.avg_dibh, stage3LiveAttempts]);

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-32">
      <PatientFlowPageHeader
        backHref={createPageUrl('EquipmentCheck') + `?patientId=${patientId}`}
        title="캘리브레이션 모니터링"
        patient={patient}
      />

      {/* Step Indicator */}
      <StepIndicator currentStep={3} />

      {/* Bluetooth Connection Status Banner */}
      {!connected && (
        <div className="bg-[#EAB308]/10 rounded-xl p-4 mb-4 border border-[#EAB308]/30 flex items-center gap-3">
          <Bluetooth className="w-5 h-5 text-[#EAB308] flex-shrink-0" />
          <p className="text-[#EAB308] text-sm">
            호흡 벨트가 연결되지 않았습니다. 시뮬레이션 데이터를 사용합니다.
          </p>
        </div>
      )}

      {/* Instruction Banner: stage-specific prompt or default */}
      <div className="bg-gradient-to-r from-[#06B6D4]/20 to-[#EAB308]/20 rounded-xl p-4 mb-6 border border-[#06B6D4]/30 flex items-center gap-3">
        <Info className="w-5 h-5 text-[#06B6D4] flex-shrink-0" />
        <p className="text-[#06B6D4] text-sm">
          {currentStageIndex === 1 && stage2Annotation.prompt
            ? stage2Annotation.prompt
            : currentStageIndex === 0
              ? '평상시 호흡을 유지하세요 (10회 OK 사이클 수집)'
              : currentStageIndex === 1
                ? '심호흡 3회: 깊이 들이마시고 내쉬세요'
                : 'DIBH 유지: 들이마신 후 목표선 위에서 유지하세요'}
        </p>
      </div>

      {/* Stats Cards - 3 equal cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Current Stage Card */}
        <div className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 -translate-y-8 translate-x-8">
            <div className="w-full h-full rounded-full bg-gradient-to-bl from-[#3B82F6]/10 to-transparent" 
              style={{
                maskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
              }} />
          </div>
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <p className="text-[#8B949E] text-sm font-medium leading-tight">현재 단계</p>
              <p className="text-2xl font-bold text-white leading-none -mt-0.5">{Math.round(stageProgress)}%</p>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              {STAGES.map((stage, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-all",
                    index < currentStageIndex && "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6]",
                    index === currentStageIndex && !isResting && "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6]",
                    index === currentStageIndex && isResting && "bg-[#06B6D4]",
                    index > currentStageIndex && "bg-[#30363D]"
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-white font-medium line-clamp-2">{currentStage.name}</p>
          </div>
        </div>

        {/* Stage metric: OK cycles + CV for Stage 1, accuracy for Stage 2/3 */}
        <div className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 -translate-y-8 translate-x-8">
            <div className={cn(
              "w-full h-full rounded-full bg-gradient-to-bl",
              currentStageIndex === 0
                ? 'from-[#22C55E]/10 to-transparent'
                : accuracy >= 85 ? 'from-[#22C55E]/10 to-transparent' :
                accuracy >= 70 ? 'from-[#EAB308]/10 to-transparent' :
                'from-[#EF4444]/10 to-transparent'
            )} 
              style={{
                maskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
              }} />
          </div>
          <div className="relative">
            {currentStageIndex === 0 ? (
              <>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[#8B949E] text-sm font-medium leading-tight">OK 사이클</p>
                  <p className="text-2xl font-bold text-white leading-none -mt-0.5">
                    {stage1Annotation.cycles.filter((c) => c.ok).length}/10
                  </p>
                </div>
                <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#22C55E] transition-all duration-300"
                    style={{ width: `${Math.min(100, (stage1Annotation.cycles.filter((c) => c.ok).length / 10) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-[#8B949E]">
                  CV: {stageData[0]?.cv != null ? `${stageData[0].cv.toFixed(1)}%` : '—'}
                </p>
              </>
            ) : currentStageIndex === 1 ? (
              <>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[#8B949E] text-sm font-medium leading-tight">Rep</p>
                  <p className="text-2xl font-bold text-white leading-none -mt-0.5">
                    {Math.min(3, stage2Annotation.attempt_idx + 1)}/3
                  </p>
                </div>
                <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#06B6D4] to-[#06B6D4] transition-all duration-300"
                    style={{ width: `${Math.min(100, (stage2Annotation.attempt_idx / 3) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-[#8B949E]">
                  Phase: {stage2Annotation.phase.replace(/_/g, ' ')}
                </p>
              </>
            ) : currentStageIndex === 2 ? (
              <>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[#8B949E] text-sm font-medium leading-tight">Rep</p>
                  <p className="text-2xl font-bold text-white leading-none -mt-0.5">
                    {Math.min(3, stage3Annotation.attempt_idx)}/3
                  </p>
                </div>
                <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#8B5CF6] transition-all duration-300"
                    style={{ width: `${Math.min(100, (stage3Annotation.attempt_idx / 3) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-[#8B949E]">
                  Phase: {stage3Annotation.phase.replace(/_/g, ' ')}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <p className="text-[#8B949E] text-sm font-medium leading-tight">정확도</p>
                  <p className="text-2xl font-bold text-white leading-none -mt-0.5">{Math.round(accuracy)}%</p>
                </div>
                <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden mb-2">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      accuracy >= 85 ? "bg-gradient-to-r from-[#22C55E] to-[#22C55E]" :
                      accuracy >= 70 ? "bg-gradient-to-r from-[#EAB308] to-[#EAB308]" :
                      "bg-gradient-to-r from-[#EF4444] to-[#EF4444]"
                    )}
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
                <p className={cn(
                  "text-xs font-medium",
                  accuracy >= 85 ? "text-[#22C55E]" : 
                  accuracy >= 70 ? "text-[#EAB308]" : 
                  "text-[#EF4444]"
                )}>
                  {accuracy >= 85 ? '우수' : accuracy >= 70 ? '보통' : '주의'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Overall Progress Card */}
        <div className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 -translate-y-8 translate-x-8">
            <div className="w-full h-full rounded-full bg-gradient-to-bl from-[#8B5CF6]/10 to-transparent" 
              style={{
                maskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)',
              }} />
          </div>
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <p className="text-[#8B949E] text-sm font-medium leading-tight">전체 진행률</p>
              <p className="text-2xl font-bold text-white leading-none -mt-0.5">{Math.round(overallProgress)}%</p>
            </div>
            <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <p className="text-xs text-[#8B949E]">
              캘리브레이션 진행 중
            </p>
          </div>
        </div>
      </div>

      {/* Countdown Screen */}
      {isCountdown && (
        <div className="bg-gradient-to-r from-[#3B82F6]/20 to-[#8B5CF6]/20 rounded-xl p-8 border border-[#3B82F6]/30 text-center mb-6">
          <Clock className="w-16 h-16 text-[#3B82F6] mx-auto mb-4 animate-pulse" />
          <h3 className="text-2xl font-bold text-white mb-2">캘리브레이션 시작</h3>
          <p className="text-5xl font-bold text-[#3B82F6] mb-3">
            {countdownTime}
          </p>
          <p className="text-[#8B949E] text-sm">
            준비하세요...
          </p>
        </div>
      )}

      {/* Completion Screen */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-[#22C55E]/20 to-[#3B82F6]/20 rounded-xl p-8 border border-[#22C55E]/30 text-center mb-6">
          <div className="w-16 h-16 bg-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">캘리브레이션 완료</h3>
          <p className="text-[#8B949E] text-sm">
            환자 선택 페이지로 이동합니다...
          </p>
        </div>
      )}

      {/* Rest Period Screen */}
      {isResting && !isCountdown && !isCompleted && (
        <div className="bg-gradient-to-r from-[#06B6D4]/20 to-[#EAB308]/20 rounded-xl p-8 border border-[#06B6D4]/30 text-center mb-6">
          <Clock className="w-16 h-16 text-[#06B6D4] mx-auto mb-4 animate-pulse" />
          <h3 className="text-2xl font-bold text-white mb-2">휴식 시간</h3>
          <p className="text-5xl font-bold text-[#06B6D4] mb-3">
            {Math.ceil(restTimeRemaining)}초
          </p>
          <p className="text-[#8B949E] text-sm">
            다음 단계 준비 중...
          </p>
        </div>
      )}

      {/* Chart: Stage 1 & 2 with annotations, Stage 3 simple */}
      {!isResting && !isCountdown && !isCompleted && currentStageIndex === 0 && (
        <CalibrationChart
          data={chartData}
          stage={1}
          cycles={stage1Annotation.cycles}
          rise_starts={stage1Annotation.rise_starts}
          fall_starts={stage1Annotation.fall_starts}
          hi={stage1Annotation.hi}
          lo={stage1Annotation.lo}
        />
      )}
      {!isResting && !isCountdown && !isCompleted && currentStageIndex === 1 && (
        <CalibrationChart
          data={chartData}
          stage={2}
          baseline_marks={stage2Annotation.baseline_marks}
          start_marks={stage2Annotation.start_marks}
          peak_marks={stage2Annotation.peak_marks}
        />
      )}
      {!isResting && !isCountdown && !isCompleted && currentStageIndex === 2 && (
        <CalibrationChart
          data={chartData}
          stage={3}
          hold_th={stage3Annotation.hold_th}
          release_th={stage3Annotation.release_th}
          target_th={stage3Annotation.target_th}
          hold_start_t={stage3Annotation.hold_start_t}
          hold_end_t={stage3Annotation.hold_end_t}
        />
      )}

      {/* 단계별 결과: below graph, averages on same row */}
      {connected && (
        <div className="bg-[#1C2128] rounded-xl p-3 mt-4 mb-4 border border-[#30363D]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#06B6D4]" />
              <span className="text-white text-sm font-medium">단계별 결과</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-[#8B949E] text-xs">
                {typeof latest === 'number' ? `${latest.toFixed(2)} N` : '—'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#0D1117] rounded-lg px-2 py-2">
              <p className="text-[#8B949E] mb-0.5">1단계 CV</p>
              <p className="text-white font-mono font-medium">
                {stageData[0]?.cv != null ? `${Math.round(stageData[0].cv)}%` : '—'}
              </p>
            </div>
            <div className="bg-[#0D1117] rounded-lg px-2 py-2">
              <p className="text-[#8B949E] mb-0.5">2단계 피크</p>
              <p className="text-white font-mono font-medium truncate" title={
                (stageData[1]?.attempt_results ?? stage2LiveAttempts).length
                  ? (stageData[1]?.attempt_results ?? stage2LiveAttempts).map((a, i) => `Rep ${i + 1}: ${a.amp != null ? a.amp.toFixed(2) : '—'} N`).join(' · ')
                  : ''
              }>
                {(stageData[1]?.attempt_results ?? stage2LiveAttempts).length
                  ? <>
                      {(stageData[1]?.attempt_results ?? stage2LiveAttempts).map((a, i) => (
                        <span key={i}>{i > 0 && ' · '}{a.amp != null ? a.amp.toFixed(1) : '—'}</span>
                      ))}
                      {stage2DisplayAvg != null && (
                        <span className="text-[#8B5CF6]">  평균 {stage2DisplayAvg.toFixed(1)} N</span>
                      )}
                    </>
                  : '—'}
              </p>
            </div>
            <div className="bg-[#0D1117] rounded-lg px-2 py-2">
              <p className="text-[#8B949E] mb-0.5">3단계 유지</p>
              <p className="text-white font-mono font-medium truncate" title={
                (stageData[2]?.attempts ?? stage3LiveAttempts).length
                  ? (stageData[2]?.attempts ?? stage3LiveAttempts).map((a, i) => `Rep ${i + 1}: ${a.hold_duration != null ? a.hold_duration.toFixed(1) : '—'}초`).join(' · ')
                  : ''
              }>
                {(stageData[2]?.attempts ?? stage3LiveAttempts).length
                  ? <>
                      {(stageData[2]?.attempts ?? stage3LiveAttempts).map((a, i) => (
                        <span key={i}>{i > 0 && ' · '}{a.hold_duration != null ? Math.round(a.hold_duration) : '—'}초</span>
                      ))}
                      {stage3DisplayAvg != null && (
                        <span className="text-[#8B5CF6]">  평균 {Math.round(stage3DisplayAvg)}초</span>
                      )}
                    </>
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        <Button
          onClick={handleRestartCurrentStage}
          variant="outline"
          disabled={isResting || isCountdown}
          className="flex-1 h-12 text-base font-semibold border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white rounded-xl disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          현재 단계 재시작
        </Button>
        <Button
          onClick={handleRestartAll}
          variant="outline"
          disabled={isResting || isCountdown}
          className="flex-1 h-12 text-base font-semibold border-[#30363D] bg-[#1C2128] text-white hover:bg-[#30363D] hover:text-white rounded-xl disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          전체 재시작
        </Button>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
        <div className="flex gap-3">
          <Button
            onClick={() => setShowEmergencyModal(true)}
            className="flex-1 h-14 text-lg font-semibold bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl"
          >
            <AlertOctagon className="w-5 h-5 mr-2" />
            긴급정지
          </Button>
        </div>
      </div>

      {/* Emergency Stop Modal */}
      <EmergencyStopModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onConfirm={handleEmergencyStop}
      />
    </div>
  );
}
