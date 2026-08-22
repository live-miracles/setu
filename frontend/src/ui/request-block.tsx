import { Card, Space, Tag, Typography } from 'antd';
import { formatProgramDateRangeFromBounds } from './format';

type RequestBlockProps = {
    kind: 'program' | 'inventory' | 'ticket';
    row: ProgramRequestDTO | InventoryRequestDTO | TicketDTO;
    dashboard: DashboardPayload;
    onClick?: () => void;
    comments?: CommentDTO[];
};

function statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function departmentShortName(
    row: ProgramRequestDTO | InventoryRequestDTO,
    dashboard: DashboardPayload,
): string {
    return (
        dashboard.departments.find(
            (department) =>
                department.Id ===
                dashboard.users.find((user) => user.Email === row.UserId)?.DepartmentId,
        )?.ShortName || '—'
    );
}

export function RequestBlock({ kind, row, dashboard, onClick, comments }: RequestBlockProps) {
    const program = kind === 'program';
    const ticket = kind === 'ticket';
    return (
        <Card size="small" hoverable={Boolean(onClick)} onClick={onClick}>
            <Space direction="vertical" size={2}>
                <div className="request-block-heading">
                    <Space size="small" wrap>
                        <Typography.Text type="secondary">
                            {ticket
                                ? `TKT-${row.DisplayId}`
                                : program
                                  ? `PRG-${row.DisplayId}`
                                  : `REQ-${row.DisplayId}`}
                        </Typography.Text>
                        {!ticket && (
                            <>
                                <Typography.Text type="secondary">·</Typography.Text>
                                <Typography.Text type="secondary">
                                    {formatProgramDateRangeFromBounds(
                                        program
                                            ? (row as ProgramRequestDTO).sessionStart
                                            : (row as InventoryRequestDTO).StartDate,
                                        program
                                            ? (row as ProgramRequestDTO).sessionEnd
                                            : (row as InventoryRequestDTO).EndDate,
                                    )}
                                </Typography.Text>
                            </>
                        )}
                    </Space>
                    <Tag color="blue">{statusLabel(row.Status)}</Tag>
                </div>
                <Typography.Text strong>
                    {ticket
                        ? (row as TicketDTO).Title || 'Untitled ticket'
                        : program
                          ? `${(row as ProgramRequestDTO).Language} · ${(row as ProgramRequestDTO).Type} · ${(row as ProgramRequestDTO).Name}`
                          : (row as InventoryRequestDTO).Name || 'Unnamed request'}
                </Typography.Text>
                <Typography.Text type="secondary">
                    {ticket
                        ? (row as TicketDTO).assigneeName || 'Unassigned'
                        : `${(row as ProgramRequestDTO | InventoryRequestDTO).userName || 'Unknown requester'} | ${departmentShortName(row as ProgramRequestDTO | InventoryRequestDTO, dashboard)}`}
                </Typography.Text>
                {comments?.length ? (
                    <Typography.Text type="secondary">
                        {comments.length} comment{comments.length === 1 ? '' : 's'} ·{' '}
                        {comments[comments.length - 1].Message}
                    </Typography.Text>
                ) : null}
            </Space>
        </Card>
    );
}
