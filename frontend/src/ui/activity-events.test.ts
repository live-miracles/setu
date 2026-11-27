import { describeChange, editChanges, statusEvent } from './activity-events';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runActivityEventAssertions(): void {
    const value = describeChange({ field: 'Name', from: 'Cameras', to: 'Studio cameras' });
    assert(
        value.kind === 'value' &&
            value.field === 'Name' &&
            value.from === 'Cameras' &&
            value.to === 'Studio cameras',
        'a changed value keeps its old and new text',
    );

    const cleared = describeChange({ field: 'Place', from: 'Hall A', to: null });
    assert(
        cleared.kind === 'value' && cleared.from === 'Hall A' && cleared.to === 'none',
        'an empty old or new value reads as none',
    );

    const list = describeChange({
        field: 'Participants',
        added: [{ label: 'a@example.test' }],
        removed: [{ label: 'b@example.test' }],
        moreRemoved: 3,
    });
    assert(
        list.kind === 'list' &&
            list.added.join('|') === 'a@example.test' &&
            list.removed.join('|') === 'b@example.test|3 more',
        'a list change names what was added and removed and counts the rest',
    );

    const onlyAdded = describeChange({ field: 'Items', added: [{ label: 'Tripod × 1' }] });
    assert(
        onlyAdded.kind === 'list' && onlyAdded.removed.length === 0,
        'a list change without removals has no removed lines',
    );

    const sessions = describeChange({
        field: 'Sessions',
        added: [
            {
                label: 'Closing · Talk',
                startAt: '2031-02-01T09:00:00Z',
                endAt: '2031-02-01T10:00:00Z',
            },
        ],
    });
    assert(
        sessions.kind === 'list' &&
            sessions.added[0].startsWith('Closing · Talk · ') &&
            sessions.added[0].length > 'Closing · Talk · '.length,
        'a session entry shows its schedule after the label',
    );

    assert(editChanges(null).length === 0, 'an edit without data lists nothing');
    assert(
        editChanges({ changes: [{ field: 'Name', from: 'a', to: 'b' }] }).length === 1,
        'an edit lists its changes',
    );

    const status = statusEvent({ from: 'submitted', to: 'approved', note: '  Hall A  ' });
    assert(
        status?.from === 'submitted' && status.to === 'approved' && status.note === 'Hall A',
        'a status event gives the old and new status and a trimmed note',
    );
    assert(statusEvent(null) === undefined, 'a status event without data has no summary');
    assert(
        statusEvent({ from: 'a', to: 'b', note: null })?.note === '',
        'a status event without a note has an empty note',
    );
}
