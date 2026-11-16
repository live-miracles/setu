import type { ReactNode } from 'react';
import { Button, Typography } from './kit';
import { Icon } from './icons';
import { useIsWideViewport } from './viewport';

// A list page whose selected record opens beside the list on wide screens and
// replaces the list (the original full-page detail) on narrow ones. The
// selection lives in the URL, so both layouts share the same routes.
export function MasterDetail({
    heading,
    list,
    detail,
    detailKey,
    narrowListClassName,
    children,
}: {
    // The list's title and filters; hidden on narrow screens while a record is open.
    heading: ReactNode;
    list: ReactNode;
    // The selected record's heading and sections, or null when nothing is selected.
    detail: ReactNode | null;
    // Changes with the selected record so the pane starts at the top again.
    detailKey?: string;
    // Extra class for the narrow list page (e.g. a board that scrolls its own list).
    narrowListClassName?: string;
    // Overlays (modals, confirmations) that belong to the page, in either layout.
    children?: ReactNode;
}) {
    const wide = useIsWideViewport();
    const hasDetail = detail != null && detail !== false;
    if (!wide) {
        return (
            <section
                className={`antd-page${hasDetail ? ' detail-page' : narrowListClassName ? ` ${narrowListClassName}` : ''}`}>
                {hasDetail ? (
                    detail
                ) : (
                    <>
                        {heading}
                        {list}
                    </>
                )}
                {children}
            </section>
        );
    }
    return (
        <section className="antd-page master-detail-page">
            {heading}
            <div className={`master-detail${hasDetail ? ' has-detail' : ''}`}>
                <div className="master-detail-list">{list}</div>
                {hasDetail && (
                    <div key={detailKey} className="master-detail-pane">
                        {detail}
                    </div>
                )}
            </div>
            {children}
        </section>
    );
}

// The detail's title row: the record's name with its actions on the right.
export function DetailHeading({ title, actions }: { title: ReactNode; actions: ReactNode }) {
    return (
        <div className="antd-page-heading">
            <div>
                <Typography.Title level={2}>{title}</Typography.Title>
            </div>
            {actions}
        </div>
    );
}

// Returns to the list on narrow screens; closes the side pane on wide ones.
export function DetailBackButton({ label, onClick }: { label: string; onClick: () => void }) {
    const wide = useIsWideViewport();
    return (
        <Button
            // Closing the side pane is a quiet action; going back stays a bordered button.
            type={wide ? 'text' : 'default'}
            icon={<Icon name={wide ? 'close' : 'arrowLeft'} />}
            onClick={onClick}
            aria-label={wide ? `Close ${label.toLowerCase()}` : `Back to ${label.toLowerCase()}`}
            title={wide ? `Close ${label.toLowerCase()}` : `Back to ${label.toLowerCase()}`}
        />
    );
}
