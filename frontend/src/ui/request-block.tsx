import { Card, Space, Tag, Typography } from 'antd';
import { formatProgramDateRangeFromBounds } from './format';

type RequestBlockProps = {
    kind: 'program' | 'inventory';
    row: ProgramRequestDTO | InventoryRequestDTO;
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
    return (
        <Card size="small" hoverable={Boolean(onClick)} onClick={onClick}>
            <Space direction="vertical" size={2}>
                <div className="request-block-heading">
                    <Space size="small" wrap>
                        <Typography.Text type="secondary">
                            {program ? `PRG-${row.DisplayId}` : `REQ-${row.DisplayId}`}
                        </Typography.Text>
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
                    </Space>
                    <Tag color="blue">{statusLabel(row.Status)}</Tag>
                </div>
                <Typography.Text strong>
                    {program
                        ? `${(row as ProgramRequestDTO).Language} · ${(row as ProgramRequestDTO).Type} · ${row.Name}`
                        : row.Name || 'Unnamed request'}
                </Typography.Text>
                <Typography.Text type="secondary">
                    {row.userName || 'Unknown requester'} | {departmentShortName(row, dashboard)}
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
