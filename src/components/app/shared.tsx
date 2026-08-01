'use client';

import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Button, Input, Tag } from 'antd';
import { useState } from 'react';
import type { Comment, InventoryRequestStatus, ProgramRequestStatus, TicketStatus } from '@/domain/types';

const colors: Record<string, { color: string; background: string }> = {
    draft: { color: '#656870', background: '#f1f1ed' },
    submitted: { color: '#98651e', background: '#fff3dd' },
    approved: { color: '#1f7c62', background: '#e6f7f0' },
    issued: { color: '#225a91', background: '#eaf3ff' },
    returned: { color: '#1f7c62', background: '#e6f7f0' },
    rejected: { color: '#a73e4c', background: '#ffebee' },
    cancelled: { color: '#656870', background: '#f1f1ed' },
    closed: { color: '#656870', background: '#f1f1ed' },
    unassigned: { color: '#98651e', background: '#fff3dd' },
    pending: { color: '#225a91', background: '#eaf3ff' },
};

export function StatusTag({
    status,
}: {
    status: InventoryRequestStatus | ProgramRequestStatus | TicketStatus;
}) {
    const palette = colors[status] ?? colors.draft;
    const icon =
        status === 'closed' || status === 'returned' || status === 'approved' ? (
            <CheckCircleOutlined />
        ) : status === 'rejected' || status === 'cancelled' ? (
            <CloseCircleOutlined />
        ) : status === 'submitted' || status === 'unassigned' ? (
            <ExclamationCircleOutlined />
        ) : (
            <ClockCircleOutlined />
        );

    return (
        <Tag
            className="status-tag"
            icon={icon}
            style={{ color: palette.color, background: palette.background }}>
            {status}
        </Tag>
    );
}

export function CommentsPanel({
    comments,
    onAdd,
}: {
    comments: Comment[];
    onAdd: (message: string) => Promise<void>;
}) {
    const [value, setValue] = useState('');
    return (
        <div className="list-stack">
            {comments.length === 0 ? (
                <p className="row-meta">No comments yet.</p>
            ) : (
                comments.map((item) => (
                    <div className="request-row" key={item.id}>
                        <div>
                            <strong>{item.author.name}</strong>
                            <div className="request-items">{item.message}</div>
                        </div>
                        <span className="request-id">
                            {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                    </div>
                ))
            )}
            <Input.TextArea
                rows={3}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Add a comment"
            />
            <Button
                type="primary"
                disabled={!value.trim()}
                onClick={async () => {
                    await onAdd(value.trim());
                    setValue('');
                }}>
                Add comment
            </Button>
        </div>
    );
}
