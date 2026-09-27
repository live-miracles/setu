export function requestStatusTagColor(status: string, overdue = false): string {
    if (status === 'rejected') return 'red';
    if (status === 'approved') return 'green';
    if (status === 'cancelled') return 'default';
    if (status === 'draft') return 'default';
    if (status === 'issued') return overdue ? 'red' : 'green';
    return 'blue';
}
