import type { ReactNode } from 'react';
import { Button, Space } from 'antd';
import { DetailSections } from '../ui/detail-layout';
import { Page } from './refine-shared';

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
        <Page title={title} action={action} className="detail-page">
            <DetailSections>{children}</DetailSections>
        </Page>
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
                <Button type="primary" key={action} onClick={() => onAction(action)}>
                    {action}
                </Button>
            ))}
        </Space>
    );
}
