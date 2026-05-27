'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================
// TYPES — Aligned with AgentPhase from state-graph.ts
// ============================================================

export type AgentPhase =
  | 'INIT'
  | 'PLAN'
  | 'THINK'
  | 'ACT'
  | 'OBSERVE'
  | 'REFLECT'
  | 'CORRECT'
  | 'RETRY'
  | 'RESPOND'
  | 'ERROR'
  | 'COMPLETE';

export interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'reflection' | 'plan' | 'error' | 'result' | 'retry' | 'correction';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;
  reflectionScore?: number;
  needsRetry?: boolean;
  retryCount?: number;
  alternativeApproach?: string;
}

interface UseAgentExecutionOptions {
  /** Maximum steps for progress calculation */
  maxSteps?: number;
  /** Auto-scroll to latest step */
  autoScroll?: boolean;
  /** Scroll container ref for auto-scroll */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

// ============================================================
// PHASE MAPPING — Map execution step types to agent phases
// ============================================================

function stepTypeToPhase(stepType: ExecutionStep['type']): AgentPhase {
  switch (stepType) {
    case 'plan': return 'PLAN';
    case 'thought': return 'THINK';
    case 'action': return 'ACT';
    case 'observation': return 'OBSERVE';
    case 'reflection': return 'REFLECT';
    case 'correction': return 'CORRECT';
    case 'retry': return 'RETRY';
    case 'result': return 'RESPOND';
    case 'error': return 'ERROR';
    default: return 'THINK';
  }
}

// ============================================================
// HOOK
// ============================================================

export function useAgentExecution(options: UseAgentExecutionOptions = {}) {
  const {
    maxSteps: defaultMaxSteps = 10,
    autoScroll = true,
    scrollContainerRef,
  } = options;

  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<AgentPhase>('INIT');
  const [progress, setProgress] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const maxStepsRef = useRef(defaultMaxSteps);

  /**
   * Auto-scroll to bottom of the scroll container
   */
  const scrollToBottom = useCallback(() => {
    if (!autoScroll || !scrollContainerRef?.current) return;

    try {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight;
    } catch {
      // Ignore scroll errors
    }
  }, [autoScroll, scrollContainerRef]);

  /**
   * Parse SSE data from the execute endpoint
   */
  const parseSSELine = useCallback((line: string): { type: string; data: unknown } | null => {
    if (!line.startsWith('data: ')) return null;
    const dataStr = line.slice(6).trim();
    if (dataStr === '[DONE]') return { type: 'done', data: null };

    try {
      const parsed = JSON.parse(dataStr);
      return { type: parsed.type || 'message', data: parsed };
    } catch {
      return null;
    }
  }, []);

  /**
   * Handle an execution step from the stream
   */
  const handleStep = useCallback((step: ExecutionStep) => {
    setSteps(prev => [...prev, step]);

    // Update phase
    const phase = stepTypeToPhase(step.type);
    setCurrentPhase(phase);

    // Update confidence
    if (step.confidence !== undefined) {
      setConfidence(step.confidence);
    }

    // Update progress
    setSteps(currentSteps => {
      const totalSteps = maxStepsRef.current;
      const completedSteps = currentSteps.filter(
        s => s.type === 'observation' || s.type === 'result' || s.type === 'reflection'
      ).length;
      const progressPercent = Math.min(Math.round((completedSteps / totalSteps) * 100), 100);
      setProgress(progressPercent);
      return currentSteps;
    });

    // Auto-scroll
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom]);

  /**
   * Execute an agent task with SSE streaming
   */
  const execute = useCallback(async (agentId: string, task: string) => {
    if (isRunning) return;

    // Reset state
    setSteps([]);
    setIsRunning(true);
    setCurrentPhase('INIT');
    setProgress(0);
    setConfidence(0);
    setResult(null);
    setError(null);

    // Create AbortController for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setCurrentPhase('INIT');

      const response = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          maxSteps: maxStepsRef.current,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur réseau' }));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Pas de flux de réponse');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (split by double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          const lines = message.split('\n');

          for (const line of lines) {
            const parsed = parseSSELine(line);
            if (!parsed) continue;

            switch (parsed.type) {
              case 'start': {
                // Execution started
                const data = parsed.data as { agentId?: string; agentName?: string; task?: string };
                setCurrentPhase('PLAN');
                break;
              }

              case 'step': {
                // Individual step received
                const data = parsed.data as { step: ExecutionStep };
                if (data.step) {
                  handleStep(data.step);
                }
                break;
              }

              case 'complete': {
                // Execution completed
                const data = parsed.data as { steps?: ExecutionStep[]; totalSteps?: number };
                setCurrentPhase('COMPLETE');
                setProgress(100);

                // Extract result from steps
                if (data.steps && Array.isArray(data.steps)) {
                  const resultStep = [...data.steps].reverse().find(s => s.type === 'result');
                  if (resultStep) {
                    setResult(resultStep.content);
                  }
                }
                break;
              }

              case 'error': {
                // Error occurred
                const data = parsed.data as { error?: string };
                setCurrentPhase('ERROR');
                setError(data.error || 'Erreur d\'exécution');
                break;
              }

              case 'done': {
                // Stream finished
                break;
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          const parsed = parseSSELine(line);
          if (parsed && parsed.type === 'step') {
            const data = parsed.data as { step: ExecutionStep };
            if (data.step) {
              handleStep(data.step);
            }
          }
        }
      }

      // If we didn't get a COMPLETE phase, try to extract result from steps
      setCurrentPhase(prev => {
        if (prev !== 'ERROR') {
          return 'COMPLETE';
        }
        return prev;
      });

      setProgress(100);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the execution
        setCurrentPhase('ERROR');
        setError('Exécution annulée');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        setCurrentPhase('ERROR');
        setError(errorMessage);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [isRunning, parseSSELine, handleStep]);

  /**
   * Cancel the current execution
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  /**
   * Reset all execution state
   */
  const reset = useCallback(() => {
    setSteps([]);
    setIsRunning(false);
    setCurrentPhase('INIT');
    setProgress(0);
    setConfidence(0);
    setResult(null);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    execute,
    steps,
    isRunning,
    currentPhase,
    progress,
    confidence,
    result,
    error,
    cancel,
    reset,
  };
}
