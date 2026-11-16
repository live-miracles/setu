import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Space } from '../ui/kit';
import { DetailSections } from '../ui/detail-layout';
import { DetailHeading } from '../ui/master-detail';
import { requestActionTone } from '../ui/request-status';

export function DetailFields({ fields }: { fields: Array<[label: string, value: ReactNode]> }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-baseline gap-2">
                    <dt className="shrink-0 text-xs font-semibold text-black/50">{label}</dt>
                    <dd className="min-w-0 break-words text-sm">{value}</dd>
                </div>
            ))}
        </div>
    );
}

// A foreign-key value (a request's department or requester) that opens that
// record. Plain text when the viewer cannot open the target page.
export function DetailLink({
    to,
    enabled = true,
    children,
}: {
    to: string;
    enabled?: boolean;
    children: ReactNode;
}) {
    if (!enabled) return <>{children}</>;
    return (
        <Link to={to} className="detail-link">
            {children}
        </Link>
    );
}

// A record's heading and sections. The page around it comes from the list's
// MasterDetail: a pane beside the list on wide screens, the full page on narrow.
export function DetailLayout({
    title,
    action,
    children,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <>
            <DetailHeading title={title} actions={action} />
            <DetailSections>{children}</DetailSections>
        </>
    );
}

export function WorkflowActions({
    actions,
    onAction,
}: {
    actions: string[];
    onAction: (action: string) => void;
}) {
    return (
        <Space wrap>
            {actions.map((action) => (
                <Button
                    type="primary"
                    key={action}
                    tone={requestActionTone(action)}
                    onClick={() => onAction(action)}>
                    {action}
                </Button>
            ))}
        </Space>
    );
}
