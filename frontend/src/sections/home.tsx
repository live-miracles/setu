import { Button, Card, Divider, Empty, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import homeHeroImage from '../../assets/home-hero.avif';
import {
    inventoryPath,
    inventoryRequestPath,
    programRequestPath,
    programsPath,
    rosterPath,
} from '../paths';
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

type RequestKind = 'programs' | 'inventory';
type HomeRequest = {
    Id: string;
    DisplayId: number;
    Name: string;
    Status: string;
};

function HomeLinkList<T>({
    items,
    getKey,
    getHref,
    onOpen,
    render,
}: {
    items: T[];
    getKey: (item: T) => string;
    getHref: (item: T) => string;
    onOpen: (item: T) => void;
    render: (item: T) => React.ReactNode;
}) {
    if (!items.length) return <EmptyState />;
    return items.map((item) => (
        <Button
            key={getKey(item)}
            type="text"
            block
            className="antd-list-button"
            href={getHref(item)}
            onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                onOpen(item);
            }}>
            {render(item)}
        </Button>
    ));
}

function HomeRequestList({ requests, kind }: { requests: HomeRequest[]; kind: RequestKind }) {
    const navigate = useNavigate();
    const hrefFor = (request: HomeRequest) =>
        kind === 'programs' ? programRequestPath(request.Id) : inventoryRequestPath(request.Id);
    const openRequest = (request: HomeRequest) => navigate(hrefFor(request));

    return (
        <HomeLinkList
            items={requests}
            getKey={(request) => request.Id}
            getHref={hrefFor}
            onOpen={openRequest}
            render={(request) => (
                <Space className="home-list-row">
                    <Typography.Text strong>
                        REQ-{request.DisplayId} · {request.Name}
                    </Typography.Text>
                    <Tag>{request.Status}</Tag>
                </Space>
            )}
        />
    );
}

export function Home({ dashboard }: Props) {
    const navigate = useNavigate();
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
                            onClick={() => navigate(rosterPath)}>
                            <Space className="home-list-row">
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
                            onClick={() => navigate(rosterPath)}>
                            <Space className="home-list-row">
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
                    extra={sectionAction('Pending program requests', () => navigate(programsPath))}>
                    <HomeRequestList requests={pendingProgramRequests} kind="programs" />
                </Card>
                <Card
                    title={sectionTitle(
                        'Ongoing Inventory Requests',
                        dashboard.inventoryRequests.length,
                    )}
                    className="home-scroll-card"
                    extra={sectionAction('Ongoing Inventory Requests', () =>
                        navigate(inventoryPath),
                    )}>
                    <HomeRequestList requests={dashboard.inventoryRequests} kind="inventory" />
                </Card>
            </div>
            <div className="home-section">
                <Card title="Recent comments" className="home-recent-comments">
                    <HomeLinkList
                        items={recentComments}
                        getKey={({ comment }) => comment.Id}
                        getHref={({ request, kind }) =>
                            kind === 'programs'
                                ? programRequestPath(request.Id)
                                : inventoryRequestPath(request.Id)
                        }
                        onOpen={({ request, kind }) =>
                            navigate(
                                kind === 'programs'
                                    ? programRequestPath(request.Id)
                                    : inventoryRequestPath(request.Id),
                            )
                        }
                        render={({ comment, request }) => (
                            <>
                                <Typography.Text strong>
                                    REQ-{request.DisplayId} · {request.Name}
                                </Typography.Text>
                                <Typography.Text type="secondary">
                                    {comment.userName || comment.UserId} ·{' '}
                                    {formatDateTime(comment.Timestamp)}
                                </Typography.Text>
                                <div className="home-comment-message">{comment.Message}</div>
                            </>
                        )}
                    />
                </Card>
            </div>
        </Page>
    );
}
