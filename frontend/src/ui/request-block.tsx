import { Space, Tag, Typography } from '../ui/kit';
import { formatProgramDateRangeFromBounds } from './format';
import { BlockCard } from './block-card';
import { requestStatusTagColor } from './request-status';
import { isRequestOverdue } from '../workflows';

type RequestBlockProps = {
    kind: 'program' | 'inventory';
    row: ProgramRequestDTO | InventoryRequestDTO;
    dashboard: DashboardPayload;
    href?: string;
    // The request currently open beside the list.
    selected?: boolean;
    onClick?: () => void;
};

export function statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// The department's short name, or its full name when it has no short name.
export function departmentLabel(
    row: ProgramRequestDTO | InventoryRequestDTO,
    dashboard: DashboardPayload,
): string {
    const department = dashboard.departments.find(
        (candidate) =>
            candidate.Id ===
            dashboard.users.find((user) => user.Email === row.UserId)?.DepartmentId,
    );
    return department?.ShortName || department?.Name || '—';
}

export function RequestBlock({ kind, row, dashboard, href, selected, onClick }: RequestBlockProps) {
    const program = kind === 'program';
    const overdue = !program && isRequestOverdue(row as InventoryRequestDTO);
    return (
        <BlockCard className="request-block" href={href} selected={selected} onClick={onClick}>
            <Space direction="vertical" size={2} className="request-block-content">
                <div className="request-block-heading">
                    {/* One unbreakable line: the id and dates are never split; if
                        the card is ever too narrow the line is cut with an
                        ellipsis instead. */}
                    <Typography.Text type="secondary" className="request-block-meta">
                        {`${program ? 'PRG' : 'REQ'}-${row.DisplayId} · ${formatProgramDateRangeFromBounds(
                            program
                                ? (row as ProgramRequestDTO).sessionStart
                                : (row as InventoryRequestDTO).StartDate,
                            program
                                ? (row as ProgramRequestDTO).sessionEnd
                                : (row as InventoryRequestDTO).EndDate,
                        )}`}
                    </Typography.Text>
                    <Tag color={requestStatusTagColor(row.Status, overdue)}>
                        {statusLabel(row.Status)}
                    </Tag>
                </div>
                <Typography.Text strong>
                    {program
                        ? `${(row as ProgramRequestDTO).Language} · ${(row as ProgramRequestDTO).Type} · ${(row as ProgramRequestDTO).Name}`
                        : (row as InventoryRequestDTO).Name || 'Unnamed request'}
                </Typography.Text>
                {overdue && (
                    <Typography.Text type="danger" strong>
                        Equipment return overdue.
                    </Typography.Text>
                )}
                <Typography.Text type="secondary">
                    {[
                        row.userName || 'Unknown requester',
                        departmentLabel(row, dashboard),
                        ...(program && (row as ProgramRequestDTO).placeName
                            ? [(row as ProgramRequestDTO).placeName]
                            : []),
                    ].join(' | ')}
                </Typography.Text>
            </Space>
        </BlockCard>
    );
}
