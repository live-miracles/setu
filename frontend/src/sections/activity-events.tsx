import type { ReactNode } from 'react';
import { editChanges, statusEvent, type ChangeView } from '../ui/activity-events';
import { formatDateTime } from '../ui/format';
import { Icon } from '../ui/icons';
import { Tag } from '../ui/kit';
import { requestStatusTagColor } from '../ui/request-status';

// The rows of the Activity card that are not written comments: a workflow
// action changed the request's status, or someone edited its details. They are
// one compact line each, so the conversation stays easy to follow.

function EventRow({
    icon,
    time,
    detail,
    children,
}: {
    icon: 'history' | 'edit';
    time: string;
    // Below the headline: a status note or the list of edited fields.
    detail?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex gap-2 border-b border-line pb-2 text-sm last:border-0">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tag-neutral text-[11px] text-steel">
                <Icon name={icon} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink/80">
                    {children}
                    <span className="ml-auto text-xs text-steel">{formatDateTime(time)}</span>
                </div>
                {detail}
            </div>
        </div>
    );
}

export function StatusEventRow({ comment }: { comment: CommentDTO }) {
    const status = statusEvent(comment.Data);
    // Without structured data (never expected) fall back to the stored sentence.
    if (!status) {
        return (
            <EventRow icon="history" time={comment.Timestamp}>
                <span className="font-medium text-ink">{comment.userName}</span>
                <span>{comment.Message}</span>
            </EventRow>
        );
    }
    return (
        <EventRow
            icon="history"
            time={comment.Timestamp}
            detail={
                status.note && (
                    <p className="mt-1 border-l-2 border-line pl-2 whitespace-pre-wrap text-ink/70">
                        {status.note}
                    </p>
                )
            }>
            <span className="font-medium text-ink">{comment.userName}</span>
            <span>changed the status</span>
            {status.from && (
                <>
                    <Tag color={requestStatusTagColor(status.from)}>{status.from}</Tag>
                    <span aria-hidden="true" className="text-steel">
                        →
                    </span>
                </>
            )}
            <Tag color={requestStatusTagColor(status.to)}>{status.to}</Tag>
        </EventRow>
    );
}

function ChangeLine({ change }: { change: ChangeView }) {
    if (change.kind === 'value') {
        return (
            <li>
                <span className="font-medium text-ink">{change.field}</span>{' '}
                <span className="text-steel line-through">{change.from}</span>
                {' → '}
                <span className="text-ink">{change.to}</span>
            </li>
        );
    }
    return (
        <li>
            <span className="font-medium text-ink">{change.field}</span>
            {change.added.length > 0 && (
                <span className="text-success"> added {change.added.join(', ')}</span>
            )}
            {change.removed.length > 0 && (
                <span className="text-error-text"> removed {change.removed.join(', ')}</span>
            )}
        </li>
    );
}

export function EditEventRow({ comment }: { comment: CommentDTO }) {
    const changes = editChanges(comment.Data);
    return (
        <EventRow
            icon="edit"
            time={comment.Timestamp}
            detail={
                changes.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink/70">
                        {changes.map((change, index) => (
                            <ChangeLine key={`${change.field}-${index}`} change={change} />
                        ))}
                    </ul>
                ) : (
                    <p className="mt-1 text-ink/70">{comment.Message}</p>
                )
            }>
            <span className="font-medium text-ink">{comment.userName}</span>
            <span>edited the request</span>
        </EventRow>
    );
}
