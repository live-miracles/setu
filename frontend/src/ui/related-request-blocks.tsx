import { Empty, Pagination, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { RequestBlock } from './request-block';

const PAGE_SIZE = 6;

export function RelatedRequestBlocks({
    title,
    kind,
    items,
    dashboard,
    emptyMessage,
    onOpen,
}: {
    title: string;
    kind: 'program' | 'inventory';
    items: (ProgramRequestDTO | InventoryRequestDTO)[];
    dashboard: DashboardPayload;
    emptyMessage: string;
    onOpen: (id: string) => void;
}) {
    const [page, setPage] = useState(1);
    useEffect(() => setPage(1), [items.length]);
    const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <section>
            <div className="related-request-heading">
                <Typography.Title level={3}>
                    {title} <Tag>{items.length}</Tag>
                </Typography.Title>
                {items.length > PAGE_SIZE && (
                    <Pagination
                        size="small"
                        current={page}
                        pageSize={PAGE_SIZE}
                        total={items.length}
                        showSizeChanger={false}
                        onChange={setPage}
                    />
                )}
            </div>
            {items.length ? (
                <div className="department-related-grid">
                    {pageItems.map((item) => (
                        <RequestBlock
                            key={item.Id}
                            kind={kind}
                            row={item}
                            dashboard={dashboard}
                            onClick={() => onOpen(item.Id)}
                        />
                    ))}
                </div>
            ) : (
                <Empty description={emptyMessage} />
            )}
        </section>
    );
}
