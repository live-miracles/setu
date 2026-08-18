import type { ReactNode } from 'react';
import { Card, Input, Space, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface TableViewProps {
    title: string;
    count: number;
    action?: ReactNode;
    searchValue?: string;
    onSearch?: (value: string) => void;
    searchPlaceholder?: string;
    children: ReactNode;
}

// Shared table chrome. The table itself stays with the page so each resource
// can keep its own columns, row actions, empty state, and responsive behavior.
export function TableView({
    title,
    count,
    action,
    searchValue,
    onSearch,
    searchPlaceholder = 'Search',
    children,
}: TableViewProps) {
    return (
        <Card
            title={
                <Space size="small">
                    <span>{title}</span>
                    <Tag>{count}</Tag>
                </Space>
            }
            extra={action}>
            {onSearch && (
                <div className="antd-table-search">
                    <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onChange={(event) => onSearch(event.target.value)}
                    />
                </div>
            )}
            {children}
        </Card>
    );
}
