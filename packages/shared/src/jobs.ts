export const JOB_STATES = ['queued', 'preparing', 'rendering', 'completed', 'failed', 'cancelled'] as const;
export type JobState = (typeof JOB_STATES)[number];

const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  queued: ['preparing', 'cancelled', 'failed'],
  preparing: ['rendering', 'failed', 'cancelled'],
  rendering: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'], // retry
  cancelled: ['queued'], // retry
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export const isActiveState = (s: JobState) => s === 'queued' || s === 'preparing' || s === 'rendering';
