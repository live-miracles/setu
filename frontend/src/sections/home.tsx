import { Button, Card, Divider, Empty, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import homeHeroImage from '../../assets/home-hero.avif';
import {
    inventoryRequestUrl,
    navigateToInventoryRequest,
    navigateToRequestList,
    navigateToRoster,
    navigateToProgram,
    programRequestUrl,
} from '../router';
import { isPlainLeftClick } from '../ui/link-click';
import { formatDateTime, formatTimeOfDay } from '../ui/format';
import { formatLocalDateOnly } from '../ui/date';

type Props = { dashboard: DashboardPayload };

function Page({ children }: { children: React.ReactNode }) {
    return <section className="antd-page">{children}</section>;
}

function EmptyState({ children = 'Nothing here yet.' }: { children?: React.ReactNode }) {
    return <Empty description={children} />;
}

function sectionTitle(title: string, count: number) {
    return (
        <Space size="small">
            <span>{title}</span>
            <Tag>{count}</Tag>
        </Space>
    );
}

function sectionAction(title: string, onClick: () => void) {
    return (
        <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onClick}
            aria-label={`Open ${title}`}
            title={`Open ${title}`}
        />
    );
}

export function Home({ dashboard }: Props) {
    const pendingProgramRequests = dashboard.programRequests.filter((request) =>
        ['draft', 'submitted'].includes(request.Status),
    );
    const todayIso = formatLocalDateOnly(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = formatLocalDateOnly(tomorrowDate);
    const shortDate = (dateIso: string) =>
        new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
        });
    const shiftsForDate = (dateIso: string) =>
        dashboard.upcomingRosters
            .filter((roster) => roster.StartDate <= dateIso && roster.EndDate >= dateIso)
            .sort((a, b) =>
                `${a.StartTime}|${a.Name}|${a.userName}`.localeCompare(
                    `${b.StartTime}|${b.Name}|${b.userName}`,
                ),
            );
    const todayShifts = shiftsForDate(todayIso);
    const tomorrowShifts = shiftsForDate(tomorrowIso);
    const recentComments = [
        ...dashboard.programRequests.flatMap((request) =>
            request.comments.map((comment) => ({ comment, request, kind: 'programs' as const })),
        ),
        ...dashboard.inventoryRequests.flatMap((request) =>
            request.comments.map((comment) => ({ comment, request, kind: 'inventory' as const })),
        ),
    ]
        .sort(
            (a, b) =>
                new Date(b.comment.Timestamp).getTime() - new Date(a.comment.Timestamp).getTime(),
        )
        .slice(0, 8);

    return (
        <Page>
            <section
                className="home-section home-hero"
                style={{ backgroundImage: `url(${homeHeroImage})` }}
                aria-labelledby="home-hero-title">
                <div className="home-hero-content">
                    <Typography.Title id="home-hero-title" level={1}>
                        Setu
                    </Typography.Title>
                    <Typography.Paragraph>Your operations, connected.</Typography.Paragraph>
                </div>
            </section>
            <div className="home-section antd-two-column">
                <Card title={null}>
                    {dashboard.homeContent.Guidelines ? (
                        <div className="guidelines-markdown text-sm text-black/75">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {dashboard.homeContent.Guidelines}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <EmptyState />
                    )}
                </Card>
                <Card title={null}>
                    <Typography.Title level={5}>
                        Today&apos;s shifts ({shortDate(todayIso)})
                    </Typography.Title>
                    {todayShifts.map((shift) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={shift.Id}
                            onClick={navigateToRoster}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    {shift.Name} · {shift.userName || 'Unassigned'}
                                </Typography.Text>
                                <Typography.Text>
                                    {[
                                        formatTimeOfDay(shift.StartTime),
                                        formatTimeOfDay(shift.EndTime),
                                    ]
                                        .filter(Boolean)
                                        .join(' – ')}
                                </Typography.Text>
                            </Space>
                        </Button>
                    ))}
                    {!todayShifts.length && <EmptyState />}
                    <Divider className="home-shifts-divider" />
                    <Typography.Title level={5}>
                        Tomorrow&apos;s shifts ({shortDate(tomorrowIso)})
                    </Typography.Title>
                    {tomorrowShifts.map((shift) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={shift.Id}
                            onClick={navigateToRoster}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    {shift.Name} · {shift.userName || 'Unassigned'}
                                </Typography.Text>
                                <Typography.Text>
                                    {[
                                        formatTimeOfDay(shift.StartTime),
                                        formatTimeOfDay(shift.EndTime),
                                    ]
                                        .filter(Boolean)
                                        .join(' – ')}
                                </Typography.Text>
                            </Space>
                        </Button>
                    ))}
                    {!tomorrowShifts.length && <EmptyState />}
                </Card>
            </div>
            <div className="home-section antd-two-column">
                <Card
                    title={sectionTitle('Pending program requests', pendingProgramRequests.length)}
                    className="home-scroll-card"
                    extra={sectionAction('Pending program requests', () =>
                        navigateToRequestList('programs'),
                    )}>
                    {pendingProgramRequests.map((request) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={request.Id}
                            href={programRequestUrl(request.Id)}
                            onClick={(event) => {
                                if (!isPlainLeftClick(event)) return;
                                event.preventDefault();
                                navigateToProgram(request.Id);
                            }}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    REQ-{request.DisplayId} · {request.Name}
                                </Typography.Text>
                                <Tag>{request.Status}</Tag>
                            </Space>
                        </Button>
                    ))}
                    {!pendingProgramRequests.length && <EmptyState />}
                </Card>
                <Card
                    title={sectionTitle(
                        'Ongoing Inventory Requests',
                        dashboard.inventoryRequests.length,
                    )}
                    className="home-scroll-card"
                    extra={sectionAction('Ongoing Inventory Requests', () =>
                        navigateToRequestList('inventory'),
                    )}>
                    {dashboard.inventoryRequests.map((request) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={request.Id}
                            href={inventoryRequestUrl(request.Id)}
                            onClick={(event) => {
                                if (!isPlainLeftClick(event)) return;
                                event.preventDefault();
                                navigateToInventoryRequest(request.Id);
                            }}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    REQ-{request.DisplayId} · {request.Name}
                                </Typography.Text>
                                <Tag>{request.Status}</Tag>
                            </Space>
                        </Button>
                    ))}
                    {!dashboard.inventoryRequests.length && <EmptyState />}
                </Card>
            </div>
            <div className="home-section">
                <Card title="Recent comments" className="home-recent-comments">
                    {recentComments.length ? (
                        recentComments.map(({ comment, request, kind }) => {
                            const href =
                                kind === 'programs'
                                    ? programRequestUrl(request.Id)
                                    : inventoryRequestUrl(request.Id);
                            const openRequest = () =>
                                kind === 'programs'
                                    ? navigateToProgram(request.Id)
                                    : navigateToInventoryRequest(request.Id);
                            return (
                                <Button
                                    key={comment.Id}
                                    type="text"
                                    block
                                    className="antd-list-button"
                                    href={href}
                                    onClick={(event) => {
                                        if (!isPlainLeftClick(event)) return;
                                        event.preventDefault();
                                        openRequest();
                                    }}>
                                    <Typography.Text strong>
                                        REQ-{request.DisplayId} · {request.Name}
                                    </Typography.Text>
                                    <Typography.Text type="secondary">
                                        {comment.userName || comment.UserId} ·{' '}
                                        {formatDateTime(comment.Timestamp)}
                                    </Typography.Text>
                                    <div className="home-comment-message">{comment.Message}</div>
                                </Button>
                            );
                        })
                    ) : (
                        <EmptyState />
                    )}
                </Card>
            </div>
        </Page>
    );
}
