import type { ButtonTone } from './kit';

// Workflow actions take the colour of the status they lead to (see
// requestStatusTagColor): approve is green like approved, reject red like
// rejected, cancel gray like cancelled.
const ACTION_TONES: Record<string, ButtonTone> = {
    approve: 'green',
    issue: 'green',
    reject: 'red',
    delete: 'red',
    cancel: 'default',
    revise: 'default',
    reopen: 'default',
    submit: 'blue',
    unapprove: 'blue',
    close: 'blue',
};

export function requestActionTone(action: string): ButtonTone | undefined {
    return ACTION_TONES[action];
}

export function requestStatusTagColor(status: string, overdue = false): string {
    if (status === 'rejected') return 'red';
    if (status === 'approved') return 'green';
    if (status === 'cancelled') return 'default';
    if (status === 'draft') return 'default';
    if (status === 'issued') return overdue ? 'red' : 'green';
    return 'blue';
}
