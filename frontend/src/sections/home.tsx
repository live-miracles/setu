import { Button, Card, Divider, Empty, Space, Tag, Typography } from '../ui/kit';
import { Icon } from '../ui/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import {
    inventoryPath,
    inventoryRequestPath,
    programRequestPath,
    programsPath,
    rosterPath,
} from '../paths';
import { isPlainLeftClick } from '../ui/link-click';
import { formatDateTime, formatProgramDateRangeFromBounds, formatTimeOfDay } from '../ui/format';
import { formatLocalDateOnly } from '../ui/date';
import { isOngoingInventoryRequest } from '../ui/inventory-status';
import { statusLabel } from '../ui/request-block';
import { requestStatusTagColor } from '../ui/request-status';
import { isRequestOverdue } from '../workflows';

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
            icon={<Icon name="plus" />}
            onClick={onClick}
            aria-label={`Open ${title}`}
            title={`Open ${title}`}
        />
    );
}

type RequestKind = 'programs' | 'inventory';

// Program requests are PRG-n everywhere else (detail page, request blocks).
const requestSerial = (kind: RequestKind, displayId: number) =>
    `${kind === 'programs' ? 'PRG' : 'REQ'}-${displayId}`;
type HomeRequest = ProgramRequestDTO | InventoryRequestDTO;

// Home rows share one hierarchy so neighbouring text doesn't blur together: the
// request's name is the one emphasised piece, its serial and details are gray.
// (Buttons are medium weight, hence the explicit font-normal on the quiet parts.)
function RequestTitle({ kind, request }: { kind: RequestKind; request: HomeRequest }) {
    return (
        <span className="home-list-title">
            <span className="mr-1.5 font-normal text-steel">
                {requestSerial(kind, request.DisplayId)}
            </span>
            <span className="font-semibold">{request.Name}</span>
        </span>
    );
}

function requestDates(kind: RequestKind, request: HomeRequest): string {
    return kind === 'programs'
        ? formatProgramDateRangeFromBounds(
              (request as ProgramRequestDTO).sessionStart,
              (request as ProgramRequestDTO).sessionEnd,
          )
        : formatProgramDateRangeFromBounds(
              (request as InventoryRequestDTO).StartDate,
              (request as InventoryRequestDTO).EndDate,
          );
}

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
        <div key={getKey(item)} className="border-b border-line last:border-b-0">
            <Button
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
        </div>
    ));
}

type Shift = DashboardPayload['upcomingRosters'][number];

// Heading for a day's shifts: the label stays strong, the date recedes.
function ShiftsHeading({ label, count, date }: { label: string; count: number; date: string }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <Space size="small">
                <Typography.Title level={5}>{label}</Typography.Title>
                <Tag>{count}</Tag>
            </Space>
            <span className="text-sm text-steel">{date}</span>
        </div>
    );
}

// One line per shift: a badge in the shift type's own colour (as on the roster),
// the volunteer, and the hours in gray.
function ShiftList({
    shifts,
    shiftColors,
    onOpen,
}: {
    shifts: Shift[];
    shiftColors: Map<string, string>;
    onOpen: () => void;
}) {
    if (!shifts.length) return <EmptyState>No shifts.</EmptyState>;
    return (
        <div>
            {shifts.map((shift) => {
                const color = shiftColors.get(shift.ShiftTypeId);
                const hours = [formatTimeOfDay(shift.StartTime), formatTimeOfDay(shift.EndTime)]
                    .filter(Boolean)
                    .join(' – ');
                return (
                    <div key={shift.Id} className="border-b border-line last:border-b-0">
                        <Button type="text" block className="antd-list-button" onClick={onOpen}>
                            <div className="home-list-row">
                                <Tag
                                    className="justify-center md:min-w-28"
                                    style={color ? { backgroundColor: color } : undefined}>
                                    {shift.Name || shift.ShiftName}
                                </Tag>
                                <span className="home-list-title text-left font-medium">
                                    {shift.userName || (
                                        <span className="font-normal text-steel italic">
                                            Unassigned
                                        </span>
                                    )}
                                </span>
                                {hours && (
                                    <span className="shrink-0 text-sm font-normal text-steel tabular-nums">
                                        {hours}
                                    </span>
                                )}
                            </div>
                        </Button>
                    </div>
                );
            })}
        </div>
    );
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
                <div className="flex w-full min-w-0 flex-col gap-0.5 text-left">
                    <div className="home-list-row">
                        <RequestTitle kind={kind} request={request} />
                        <Tag
                            color={requestStatusTagColor(
                                request.Status,
                                kind === 'inventory' &&
                                    isRequestOverdue(request as InventoryRequestDTO),
                            )}>
                            {statusLabel(request.Status)}
                        </Tag>
                    </div>
                    <span className="truncate text-sm font-normal text-steel">
                        {[
                            request.userName || 'Unknown requester',
                            requestDates(kind, request),
                        ].join(' · ')}
                    </span>
                </div>
            )}
        />
    );
}

export function Home({ dashboard }: Props) {
    const navigate = useNavigate();
    const pendingProgramRequests = dashboard.programRequests.filter((request) =>
        ['draft', 'submitted'].includes(request.Status),
    );
    const ongoingInventoryRequests = dashboard.inventoryRequests.filter(isOngoingInventoryRequest);
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
    const shiftColors = new Map(dashboard.shiftTypes.map((type) => [type.Id, type.Color]));
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
                    <ShiftsHeading
                        label="Today's shifts"
                        count={todayShifts.length}
                        date={shortDate(todayIso)}
                    />
                    <ShiftList
                        shifts={todayShifts}
                        shiftColors={shiftColors}
                        onOpen={() => navigate(rosterPath)}
                    />
                    <Divider className="home-shifts-divider" />
                    <ShiftsHeading
                        label="Tomorrow's shifts"
                        count={tomorrowShifts.length}
                        date={shortDate(tomorrowIso)}
                    />
                    <ShiftList
                        shifts={tomorrowShifts}
                        shiftColors={shiftColors}
                        onOpen={() => navigate(rosterPath)}
                    />
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
                        ongoingInventoryRequests.length,
                    )}
                    className="home-scroll-card"
                    extra={sectionAction('Ongoing Inventory Requests', () =>
                        navigate(inventoryPath),
                    )}>
                    <HomeRequestList requests={ongoingInventoryRequests} kind="inventory" />
                </Card>
            </div>
            <div className="home-section">
                <Card
                    title={sectionTitle('Recent comments', recentComments.length)}
                    className="home-recent-comments">
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
                        render={({ comment, request, kind }) => (
                            <div className="home-comment-row">
                                <div className="home-list-row">
                                    <RequestTitle kind={kind} request={request} />
                                    <span className="home-comment-meta text-xs font-normal text-steel">
                                        <span className="font-medium text-charcoal">
                                            {comment.userName || comment.UserId}
                                        </span>{' '}
                                        · {formatDateTime(comment.Timestamp)}
                                    </span>
                                </div>
                                <div className="home-comment-message border-l-2 border-line-strong pl-2.5 text-sm font-normal text-charcoal">
                                    {comment.Message}
                                </div>
                            </div>
                        )}
                    />
                </Card>
            </div>
        </Page>
    );
}
