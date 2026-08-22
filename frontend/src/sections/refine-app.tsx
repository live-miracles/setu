import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';
import {
    Button,
    Card as AntCard,
    Divider,
    Empty as AntEmpty,
    Form as AntForm,
    Input,
    Modal as AntModal,
    Pagination,
    Select,
    Space,
    Tag,
    Table,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    CameraOutlined,
    DeleteOutlined,
    EditOutlined,
    LeftOutlined,
    PlusOutlined,
    RightOutlined,
    SearchOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryRequest,
    navigateToInventoryRequests,
    navigateBackToSection,
    navigateToProgram,
    navigateToPrograms,
    navigateToRoster,
    navigateToTicket,
    navigateToTickets,
    navigateToUser,
    refreshDashboard,
    replaceWorkbenchUrl,
} from '../router';
import {
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
    USER_QUERY_PARAM,
} from '../config';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTime, formatProgramSessionSchedule, formatTimeOfDay } from '../ui/format';
import {
    buildRosterTableModel,
    formatRosterTableTimes,
    getShiftTypeTimes,
} from '../ui/roster-table';
import { buildCalendarTableModel } from '../ui/calendar-table';
import { matchesSearch } from '../ui/search';
import { roleLabel } from '../ui/styles';
import { createRecordDestination } from '../ui/create-record';
import { addScannedInventoryItem, findInventoryTypeByQrValue } from '../ui/inventory-qr';
import { imageUrlForDriveId, prepareInventoryImage } from '../ui/inventory-image';
import { QrScanner } from '../ui/qr-scanner';
import { ImageCamera } from '../ui/image-camera';
import { RequestBlock } from '../ui/request-block';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { UserBlock } from '../ui/user-block';
import homeHeroImage from '../../assets/home-hero.avif';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    buildDuplicateProgramInput,
    canRescheduleProgram,
    getLocalDateFromSession,
    getProgramRequestActions,
    shiftProgramSessions,
} from '../ui/program-actions';
import {
    canApprove,
    canManageConfig,
    canTransitionInventoryRequest,
    canTransitionTicket,
    canUseTickets,
} from '../workflows';

type Props = { dashboard: DashboardPayload };
const OTHER_PROGRAM_TYPE = 'Other';
const error = (e: unknown) => showErrorAlert(e);

function programTypeOptions(programTypes: ProgramType[], current = ''): string[] {
    const names = [...programTypes.map((programType) => programType.Name), OTHER_PROGRAM_TYPE];
    if (current) names.unshift(current);
    return names.filter(
        (name, index) =>
            Boolean(name) &&
            names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) ===
                index,
    );
}

function formatProgramName(language: string, type: string, title: string): string {
    return [language, type.toLowerCase() === OTHER_PROGRAM_TYPE.toLowerCase() ? '' : type, title]
        .filter(Boolean)
        .join(' ');
}

function formatDateTimeLocal(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLocalDateOnly(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function blockCoversDate(block: Block, isoDate: string): boolean {
    const startDate = block.StartDateTime.slice(0, 10);
    const endDate = block.EndDateTime.slice(0, 10);
    return startDate <= isoDate && endDate >= isoDate;
}

function defaultSessionDraft(sessions: ProgramSession[]): ProgramSession {
    const draftDate = new Date();
    let startDate = new Date(draftDate);
    let endDate = new Date(draftDate);

    if (sessions.length) {
        const lastSession = sessions.reduce((latest, session) =>
            new Date(session.EndDateTime).getTime() > new Date(latest.EndDateTime).getTime()
                ? session
                : latest,
        );
        const lastStart = new Date(lastSession.StartDateTime);
        const lastEnd = new Date(lastSession.EndDateTime);
        startDate = new Date(lastEnd);
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(lastStart.getHours(), lastStart.getMinutes(), 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(lastEnd.getHours(), lastEnd.getMinutes(), 0, 0);
    } else {
        startDate.setHours(13, 0, 0, 0);
        endDate.setHours(14, 0, 0, 0);
    }

    return {
        Name: '',
        Type: '',
        StartDateTime: formatDateTimeLocal(startDate),
        EndDateTime: formatDateTimeLocal(endDate),
    };
}

function Page({
    title,
    headingContent,
    action,
    className,
    hideHeading = false,
    children,
}: {
    title: string;
    headingContent?: ReactNode;
    action?: ReactNode;
    className?: string;
    hideHeading?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={`antd-page${className ? ` ${className}` : ''}`}>
            {!hideHeading && (
                <div className="antd-page-heading">
                    <div>
                        <Typography.Title level={2}>{title}</Typography.Title>
                    </div>
                    {headingContent}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
function Card({
    title,
    action,
    className,
    children,
}: {
    title: ReactNode;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <AntCard title={title} extra={action} className={className}>
            {children}
        </AntCard>
    );
}
function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
    return <AntEmpty description={children} />;
}
function Submit({ label = 'Save', busy }: { label?: string; busy?: boolean }) {
    return (
        <Button type="primary" htmlType="submit" loading={busy}>
            {label}
        </Button>
    );
}

function SaveFooter({
    label,
    busy,
    errorMessage,
}: {
    label: string;
    busy?: boolean;
    errorMessage?: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Submit label={label} busy={busy} />
            {errorMessage && (
                <Typography.Text type="danger" className="text-sm">
                    {errorMessage}
                </Typography.Text>
            )}
        </div>
    );
}
function Modal({
    title,
    children,
    close,
}: {
    title: string;
    children: ReactNode;
    close: () => void;
}) {
    return (
        <AntModal open title={title} onCancel={close} footer={null} destroyOnHidden>
            {children}
        </AntModal>
    );
}
export function ActionConfirmation({
    action,
    description,
    onConfirm,
    onCancel,
}: {
    action: string;
    description?: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
}) {
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    return (
        <Modal title={`Confirm ${label}`} close={onCancel}>
            <form
                className="grid gap-3"
                onSubmit={async (event) => {
                    event.preventDefault();
                    await onConfirm();
                }}>
                <p>
                    {description ||
                        `Are you sure you want to ${action.toLowerCase()} this request?`}
                </p>
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>No</Button>
                    <Button type="primary" htmlType="submit">
                        Yes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
function useSave<T>(action: () => Promise<T>, close?: () => void) {
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    return {
        busy,
        errorMessage,
        run: async (event?: FormEvent) => {
            event?.preventDefault();
            if (event) {
                const form = event.currentTarget as HTMLFormElement;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return false;
                }
            }
            setErrorMessage('');
            setBusy(true);
            try {
                const result = await action();
                close?.();
                await refreshDashboard();
                return result;
            } catch (e) {
                setErrorMessage(e instanceof Error ? e.message : String(e));
                return null;
            } finally {
                setBusy(false);
            }
        },
    };
}
function TextField({
    name,
    label,
    value,
    type = 'text',
    required = false,
    pattern,
    title,
    onChange,
}: {
    name: string;
    label: string;
    value?: string | number;
    type?: string;
    required?: boolean;
    pattern?: string;
    title?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <AntForm.Item label={label} required={required} className="antd-form-item">
            <Input
                name={name}
                type={type}
                value={onChange ? (value ?? '') : undefined}
                defaultValue={onChange ? undefined : (value ?? '')}
                required={required}
                pattern={pattern}
                title={title}
                onChange={onChange}
            />
        </AntForm.Item>
    );
}

const INTERNATIONAL_PHONE_PATTERN = '\\+[1-9][0-9]{7,14}';
const INTERNATIONAL_PHONE_TITLE =
    'Enter a valid phone number with country code using digits only, for example +919000000000.';
function isValidInternationalPhone(phone: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(phone);
}

function Home({ dashboard }: Props) {
    const pendingProgramRequests = dashboard.programRequests.filter((request) =>
        ['draft', 'submitted'].includes(request.Status),
    );
    const ongoingTickets = dashboard.tickets.filter((ticket) => ticket.Status !== 'closed');
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
    const summaryCards = [
        {
            label: 'Programs',
            count: pendingProgramRequests.length,
            onClick: navigateToPrograms,
        },
        {
            label: 'Inventory',
            count: dashboard.inventoryRequests.length,
            onClick: navigateToInventoryRequests,
        },
        ...(canUseTickets(dashboard.me)
            ? [
                  {
                      label: 'Tickets',
                      count: ongoingTickets.length,
                      onClick: navigateToTickets,
                  },
              ]
            : []),
    ];
    const sectionTitle = (title: string, count: number) => (
        <Space size="small">
            <span>{title}</span>
            <Tag>{count}</Tag>
        </Space>
    );
    const sectionAction = (title: string, onClick: () => void) => (
        <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onClick}
            aria-label={`Open ${title}`}
            title={`Open ${title}`}
        />
    );
    return (
        <Page title="Home" hideHeading>
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
                <div className="antd-stat-grid home-summary-grid">
                    {summaryCards.map((card) => (
                        <AntCard
                            key={card.label}
                            className="home-summary-card"
                            hoverable={Boolean(card.onClick)}
                            onClick={card.onClick}>
                            <Space size="small">
                                <Typography.Text>{card.label}</Typography.Text>
                                <Tag>{card.count}</Tag>
                            </Space>
                        </AntCard>
                    ))}
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
                        <Empty />
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
                    {!todayShifts.length && <Empty />}
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
                    {!tomorrowShifts.length && <Empty />}
                </Card>
            </div>
            <div className="home-section antd-two-column">
                <Card
                    title={sectionTitle('Pending program requests', pendingProgramRequests.length)}
                    className="home-scroll-card"
                    action={sectionAction('Pending program requests', navigateToPrograms)}>
                    {pendingProgramRequests.map((request) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={request.Id}
                            onClick={() => navigateToProgram(request.Id)}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    REQ-{request.DisplayId} · {request.Name}
                                </Typography.Text>
                                <Tag>{request.Status}</Tag>
                            </Space>
                        </Button>
                    ))}
                    {!pendingProgramRequests.length && <Empty />}
                </Card>
                <Card
                    title={sectionTitle(
                        'Ongoing Inventory Requests',
                        dashboard.inventoryRequests.length,
                    )}
                    className="home-scroll-card"
                    action={sectionAction(
                        'Ongoing Inventory Requests',
                        navigateToInventoryRequests,
                    )}>
                    {dashboard.inventoryRequests.map((r) => (
                        <Button
                            type="text"
                            block
                            className="antd-list-button"
                            key={r.Id}
                            onClick={() => navigateToInventoryRequest(r.Id)}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Typography.Text strong>
                                    REQ-{r.DisplayId} · {r.Name}
                                </Typography.Text>
                                <Tag>{r.Status}</Tag>
                            </Space>
                        </Button>
                    ))}
                    {!dashboard.inventoryRequests.length && <Empty />}
                </Card>
            </div>
            <div className="home-section antd-two-column">
                {canUseTickets(dashboard.me) && (
                    <Card
                        title={sectionTitle('Ongoing tickets', ongoingTickets.length)}
                        className="home-scroll-card"
                        action={sectionAction('Ongoing tickets', navigateToTickets)}>
                        {ongoingTickets.map((ticket) => (
                            <Button
                                type="text"
                                block
                                className="antd-list-button"
                                key={ticket.Id}
                                onClick={() => navigateToTicket(ticket.Id)}>
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Typography.Text strong>
                                        TKT-{ticket.DisplayId} {ticket.Title}
                                    </Typography.Text>
                                    <Tag color="blue">{ticket.Status}</Tag>
                                </Space>
                            </Button>
                        ))}
                        {!ongoingTickets.length && <Empty />}
                    </Card>
                )}
            </div>
        </Page>
    );
}

function Profile({ dashboard, registration = false }: Props & { registration?: boolean }) {
    const me = dashboard.me;
    const [departmentId, setDepartmentId] = useState(me.DepartmentId);
    const save = useSave(async () => {
        const form = document.getElementById(
            registration ? 'registration-form' : 'profile-form',
        ) as HTMLFormElement;
        const d = new FormData(form);
        const phone = String(d.get('phone') || '');
        const departmentIdValue = String(d.get('departmentId') || '');
        if (!isValidInternationalPhone(phone)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        const whatsapp = String(d.get('whatsapp') || '');
        if (!isValidInternationalPhone(whatsapp)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        await api.updateOwnProfile({
            name: String(d.get('name')),
            departmentId: departmentIdValue,
            phone,
            whatsapp,
        });
    });
    return (
        <Page title={registration ? 'Welcome' : 'Profile'} hideHeading>
            <Card
                title={
                    registration ? (
                        'Get started'
                    ) : (
                        <Space size="small" wrap>
                            <Typography.Text strong>{me.Name}</Typography.Text>
                            <Typography.Text type="secondary">{me.Email}</Typography.Text>
                            <Tag color="blue">{roleLabel(me.Role)}</Tag>
                        </Space>
                    )
                }
                className="profile-form-card">
                <form
                    id={registration ? 'registration-form' : 'profile-form'}
                    className="grid gap-3"
                    noValidate
                    onSubmit={save.run}>
                    <TextField name="name" label="Name" value={me.Name} required />
                    <AntForm.Item label="Department">
                        <input type="hidden" name="departmentId" value={departmentId} />
                        <Select
                            value={departmentId}
                            onChange={setDepartmentId}
                            style={{ width: '100%' }}>
                            <Select.Option value="">No department</Select.Option>
                            {dashboard.departments.map((d) => (
                                <Select.Option key={d.Id} value={d.Id}>
                                    {d.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="phone"
                        label="Phone"
                        type="tel"
                        value={me.Phone}
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                    />
                    <TextField
                        name="whatsapp"
                        label="WhatsApp"
                        type="tel"
                        value={me.Whatsapp}
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                    />
                    <div>
                        <SaveFooter
                            label={registration ? 'Get started' : 'Save'}
                            busy={save.busy}
                            errorMessage={save.errorMessage}
                        />
                    </div>
                </form>
            </Card>
        </Page>
    );
}

function UserForm({
    dashboard,
    user,
    close,
}: {
    dashboard: DashboardPayload;
    user?: UserDTO;
    close: () => void;
}) {
    const [role, setRole] = useState<UserRole>(user?.Role || 'user');
    const [departmentId, setDepartmentId] = useState(user?.DepartmentId || '');
    const save = useSave(async () => {
        const d = new FormData(document.getElementById('refine-user-form') as HTMLFormElement);
        const values = {
            name: String(d.get('name')),
            role: String(d.get('role')) as UserRole,
            departmentId: String(d.get('departmentId') || ''),
            phone: String(d.get('phone') || ''),
            whatsapp: String(d.get('whatsapp') || ''),
        };
        if (!isValidInternationalPhone(values.phone)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        if (!isValidInternationalPhone(values.whatsapp)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        if (user) await api.updateUser(user.Email, values);
        else
            await api.createUser(
                { email: String(d.get('email')).toLowerCase(), ...values },
                generateRequestId(),
            );
    }, close);
    return (
        <Modal title={user ? 'Edit user' : 'Add user'} close={close}>
            <form id="refine-user-form" className="grid gap-3" noValidate onSubmit={save.run}>
                {!user && <TextField name="email" label="Email" type="email" required />}
                <TextField name="name" label="Name" value={user?.Name} required />
                <AntForm.Item label="Role" required>
                    <input type="hidden" name="role" value={role} required />
                    <Select value={role} onChange={setRole} style={{ width: '100%' }}>
                        {(['admin', 'approver', 'viewer', 'user'] as UserRole[]).map((r) => (
                            <Select.Option key={r} value={r}>
                                {roleLabel(r)}
                            </Select.Option>
                        ))}
                    </Select>
                </AntForm.Item>
                <AntForm.Item label="Department" required>
                    <input type="hidden" name="departmentId" value={departmentId} required />
                    <Select
                        value={departmentId}
                        onChange={setDepartmentId}
                        style={{ width: '100%' }}>
                        <Select.Option value="" disabled>
                            Select a department
                        </Select.Option>
                        {dashboard.departments.map((d) => (
                            <Select.Option key={d.Id} value={d.Id}>
                                {d.Name}
                            </Select.Option>
                        ))}
                    </Select>
                </AntForm.Item>
                <TextField
                    name="phone"
                    label="Phone"
                    type="tel"
                    value={user?.Phone}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <TextField
                    name="whatsapp"
                    label="WhatsApp"
                    type="tel"
                    value={user?.Whatsapp}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <div>
                    <SaveFooter
                        label={user ? 'Save' : 'Add'}
                        busy={save.busy}
                        errorMessage={save.errorMessage}
                    />
                </div>
            </form>
        </Modal>
    );
}
function Users({ dashboard }: Props) {
    const [editing, setEditing] = useState<UserDTO | undefined>();
    const [deleting, setDeleting] = useState<UserDTO | null>(null);
    const [creating, setCreating] = useState(false);
    const selectedUserId = new URLSearchParams(window.location.search).get(USER_QUERY_PARAM);
    const selectedUser = selectedUserId
        ? dashboard.users.find((user) => user.Email === selectedUserId) || null
        : null;
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const shown = dashboard.users;
    const filteredUsers = shown.filter((user) =>
        matchesSearch(appliedSearch, [
            user.Name,
            user.Email,
            user.departmentName,
            user.Role,
            user.Phone,
            user.Whatsapp,
        ]),
    );
    const userPrograms = selectedUser
        ? dashboard.programRequests.filter((request) => request.UserId === selectedUser.Email)
        : [];
    const userInventoryRequests = selectedUser
        ? dashboard.inventoryRequests.filter((request) => request.UserId === selectedUser.Email)
        : [];
    const userHeader = (
        <div className="antd-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>Users</Typography.Title>
            </div>
            <Space className="antd-board-filters" wrap>
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="Search users"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={() => setAppliedSearch(search)}
                    aria-label="Search users"
                    title="Search users"
                />
            </Space>
            {canManageConfig(dashboard.me) && (
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreating(true)}
                    aria-label="Add user"
                    title="Add user"
                />
            )}
        </div>
    );
    const userDetail = selectedUser && (
        <>
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>{selectedUser.Name}</Typography.Title>
                </div>
                <Space>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigateBackToSection('users')}
                        aria-label="Back to users"
                        title="Back to users"
                    />
                    {canManageConfig(dashboard.me) && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeleting(selectedUser)}
                            aria-label="Delete user"
                            title="Delete user"
                        />
                    )}
                </Space>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card
                    title="Details"
                    action={
                        canManageConfig(dashboard.me) ? (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => setEditing(selectedUser)}
                                aria-label="Edit user"
                                title="Edit user"
                            />
                        ) : null
                    }>
                    <DetailFields
                        fields={[
                            ['Email', selectedUser.Email],
                            ['Department', selectedUser.departmentName || 'No department'],
                            ['Role', roleLabel(selectedUser.Role)],
                            ['Phone', selectedUser.Phone || '—'],
                            ['WhatsApp', selectedUser.Whatsapp || '—'],
                        ]}
                    />
                </Card>
            </div>
            <div className="department-related-sections">
                <RelatedRequestBlocks
                    title="Programs"
                    kind="program"
                    items={userPrograms}
                    dashboard={dashboard}
                    emptyMessage="No program requests from this user."
                    onOpen={navigateToProgram}
                />
                <RelatedRequestBlocks
                    title="Inventory requests"
                    kind="inventory"
                    items={userInventoryRequests}
                    dashboard={dashboard}
                    emptyMessage="No inventory requests from this user."
                    onOpen={navigateToInventoryRequest}
                />
            </div>
        </>
    );
    return (
        <Page title="Users" hideHeading>
            {selectedUser ? userDetail : userHeader}
            {!selectedUser && (
                <>
                    {filteredUsers.length ? (
                        <div className="user-card-list">
                            {filteredUsers.map((user) => (
                                <UserBlock
                                    key={user.Email}
                                    user={user}
                                    dashboard={dashboard}
                                    onClick={() => navigateToUser(user.Email)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty>No users yet.</Empty>
                    )}
                </>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Are you sure you want to delete ${deleting.Name}?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await api.deleteUser(deleting.Email, generateRequestId());
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {(creating || editing) && (
                <UserForm
                    dashboard={dashboard}
                    user={editing}
                    close={() => {
                        setCreating(false);
                        setEditing(undefined);
                    }}
                />
            )}
        </Page>
    );
}

function Roster({ dashboard }: Props) {
    const canEdit = canApprove(dashboard.me);
    const [editing, setEditing] = useState<RosterDTO>();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<RosterDTO | null>(null);
    const [users, setUsers] = useState<UserDTO[]>([]);
    const rosterStartDate = new Date();
    rosterStartDate.setDate(rosterStartDate.getDate() - 2);
    const rosterStartIso = formatLocalDateOnly(rosterStartDate);
    const todayIso = formatLocalDateOnly(new Date());
    const rosterTable = buildRosterTableModel(
        dashboard.upcomingRosters,
        dashboard.shiftTypes,
        rosterStartIso,
    );
    useEffect(() => {
        if (canEdit) api.listUsers().then(setUsers).catch(error);
    }, [canEdit]);
    const Form = ({ row }: { row?: RosterDTO }) => {
        const [userId, setUserId] = useState(row?.UserId || '');
        const initialShiftType = dashboard.shiftTypes.find(
            (shiftType) => shiftType.Name === row?.Name,
        );
        const [shiftTypeId, setShiftTypeId] = useState(initialShiftType?.Id || '');
        const [startTime, setStartTime] = useState(
            row?.StartTime || initialShiftType?.DefaultStartTime || '',
        );
        const [endTime, setEndTime] = useState(
            row?.EndTime || initialShiftType?.DefaultEndTime || '',
        );
        const selectShiftType = (nextShiftTypeId: string) => {
            setShiftTypeId(nextShiftTypeId);
            const times = getShiftTypeTimes(dashboard.shiftTypes, nextShiftTypeId);
            if (!times) return;
            setStartTime(times.startTime);
            setEndTime(times.endTime);
        };
        const save = useSave(
            async () => {
                const d = new FormData(
                    document.getElementById('refine-roster-form') as HTMLFormElement,
                );
                const v = {
                    name: String(d.get('name')),
                    startDate: String(d.get('startDate')),
                    endDate: String(d.get('endDate')),
                    startTime: String(d.get('startTime') || ''),
                    endTime: String(d.get('endTime') || ''),
                    userId: String(d.get('userId') || ''),
                };
                if (row) await api.updateRoster(row.Id, v, generateRequestId());
                else await api.createRoster(v, generateRequestId());
            },
            () => {
                setCreating(false);
                setEditing(undefined);
            },
        );
        return (
            <Modal
                title={row ? 'Edit shift' : 'Schedule a shift'}
                close={() => {
                    setCreating(false);
                    setEditing(undefined);
                }}>
                <form id="refine-roster-form" className="grid gap-3" noValidate onSubmit={save.run}>
                    <AntForm.Item label="Shift" required>
                        <input
                            type="hidden"
                            name="name"
                            value={
                                dashboard.shiftTypes.find(
                                    (shiftType) => shiftType.Id === shiftTypeId,
                                )?.Name || ''
                            }
                            required
                        />
                        <Select
                            value={shiftTypeId}
                            onChange={selectShiftType}
                            style={{ width: '100%' }}>
                            <Select.Option value="" disabled>
                                Select a shift
                            </Select.Option>
                            {dashboard.shiftTypes.map((shiftType) => (
                                <Select.Option key={shiftType.Id} value={shiftType.Id}>
                                    {shiftType.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <AntForm.Item label="Assignee" required>
                        <input type="hidden" name="userId" value={userId} required />
                        <Select value={userId} onChange={setUserId} style={{ width: '100%' }}>
                            <Select.Option value="" disabled>
                                Select an assignee
                            </Select.Option>
                            {users.map((user) => (
                                <Select.Option key={user.Email} value={user.Email}>
                                    {user.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="startDate"
                        label="Start date"
                        type="date"
                        value={row?.StartDate}
                        required
                    />
                    <TextField
                        name="endDate"
                        label="End date"
                        type="date"
                        value={row?.EndDate}
                        required
                    />
                    <AntForm.Item label="Start time" className="antd-form-item">
                        <Input
                            name="startTime"
                            type="time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                        />
                    </AntForm.Item>
                    <AntForm.Item label="End time" className="antd-form-item">
                        <Input
                            name="endTime"
                            type="time"
                            value={endTime}
                            onChange={(event) => setEndTime(event.target.value)}
                        />
                    </AntForm.Item>
                    <div className="flex items-center justify-between gap-3">
                        <SaveFooter
                            label={row ? 'Save' : 'Add'}
                            busy={save.busy}
                            errorMessage={save.errorMessage}
                        />
                        {row && (
                            <Button
                                type="primary"
                                danger
                                htmlType="button"
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                    setEditing(undefined);
                                    setDeleting(row);
                                }}
                                aria-label="Delete shift"
                                title="Delete shift"
                            />
                        )}
                    </div>
                </form>
            </Modal>
        );
    };
    return (
        <Page
            title="Roster"
            className="roster-page"
            action={
                canEdit && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}
                        aria-label="Add shift"
                        title="Add shift"
                    />
                )
            }>
            <>
                {rosterTable.rows.length ? (
                    <div className="roster-table-scroll">
                        <table className="roster-table">
                            <thead>
                                <tr>
                                    <th scope="col" className="roster-date-header">
                                        Date
                                    </th>
                                    {rosterTable.volunteers.map((volunteer) => (
                                        <th
                                            key={volunteer.userId}
                                            scope="colgroup"
                                            colSpan={volunteer.lanes.length}
                                            className="roster-volunteer-header">
                                            {volunteer.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rosterTable.rows.map((row, rowIndex) => (
                                    <tr
                                        key={row.isoDate}
                                        className={
                                            row.isoDate === todayIso ? 'roster-today-row' : ''
                                        }>
                                        <th scope="row" className="roster-date-cell">
                                            {row.label}
                                        </th>
                                        {rosterTable.volunteers.flatMap((volunteer) =>
                                            volunteer.lanes.map((lane, laneIndex) => {
                                                const shift = lane.shifts.find(
                                                    (candidate) =>
                                                        candidate.startIndex === rowIndex,
                                                );
                                                const coveredByEarlierShift = lane.shifts.some(
                                                    (candidate) =>
                                                        candidate.startIndex < rowIndex &&
                                                        candidate.endIndex >= rowIndex,
                                                );
                                                if (coveredByEarlierShift) return [];
                                                if (!shift) {
                                                    return (
                                                        <td
                                                            key={`${volunteer.userId}-${laneIndex}-${row.isoDate}`}
                                                            className="roster-empty-cell"
                                                        />
                                                    );
                                                }
                                                const timing = formatRosterTableTimes(shift.roster);
                                                const dateRange =
                                                    shift.roster.StartDate === shift.roster.EndDate
                                                        ? row.label
                                                        : `${shift.roster.StartDate} – ${shift.roster.EndDate}`;
                                                return (
                                                    <td
                                                        key={`${volunteer.userId}-${laneIndex}-${row.isoDate}`}
                                                        rowSpan={
                                                            shift.endIndex - shift.startIndex + 1
                                                        }
                                                        className="roster-shift-cell">
                                                        <button
                                                            type="button"
                                                            className="roster-shift-block"
                                                            style={{
                                                                backgroundColor: shift.color
                                                                    ? `${shift.color}26`
                                                                    : undefined,
                                                            }}
                                                            onClick={() => setEditing(shift.roster)}
                                                            aria-label={`Edit ${shift.roster.Name} for ${volunteer.name}, ${dateRange}${timing ? `, ${timing}` : ''}`}>
                                                            <span className="roster-shift-name">
                                                                {shift.roster.Name}
                                                            </span>
                                                            {timing && (
                                                                <span className="roster-shift-time">
                                                                    {timing}
                                                                </span>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            }),
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty>No shifts scheduled.</Empty>
                )}
            </>
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this shift?"
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await api.deleteRoster(deleting.Id, generateRequestId());
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {(creating || editing) && <Form row={editing} />}
        </Page>
    );
}

function Calendar({ dashboard }: Props) {
    const [month, setMonth] = useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const [calendarData, setCalendarData] = useState<CalendarMonthPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;
    const todayIso = formatLocalDateOnly(new Date());
    const monthStartIso = formatLocalDateOnly(month);
    const monthEndIso = formatLocalDateOnly(new Date(year, monthNumber, 0));
    useEffect(() => {
        setLoading(true);
        api.getCalendarMonth(year, monthNumber)
            .then(setCalendarData)
            .catch(error)
            .finally(() => setLoading(false));
    }, [year, monthNumber]);
    const calendarPrograms = calendarData?.programs || [];
    const calendarPlaces = calendarData?.places || dashboard.places;
    const calendar = buildCalendarTableModel(
        calendarPrograms,
        calendarPlaces,
        dashboard.programTypes,
        todayIso,
        monthStartIso,
        monthEndIso,
        dashboard.blocks,
    );
    return (
        <Page
            title="Calendar"
            className="calendar-page"
            headingContent={
                <Space>
                    <Button
                        type="text"
                        icon={<LeftOutlined />}
                        onClick={() => setMonth(new Date(year, month.getMonth() - 1, 1))}
                        aria-label="Previous month"
                        title="Previous month"
                    />
                    <Typography.Text strong>
                        {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </Typography.Text>
                    <Button
                        type="text"
                        icon={<RightOutlined />}
                        onClick={() => setMonth(new Date(year, month.getMonth() + 1, 1))}
                        aria-label="Next month"
                        title="Next month"
                    />
                </Space>
            }>
            {loading ? (
                <Typography.Text type="secondary">Loading calendar…</Typography.Text>
            ) : calendar.rows.length ? (
                <div className="calendar-table-scroll">
                    <table className="calendar-table">
                        <thead>
                            <tr>
                                <th scope="col" className="calendar-date-header">
                                    Date
                                </th>
                                {calendar.places.map((place) => (
                                    <th
                                        key={place.Id}
                                        scope="col"
                                        className="calendar-place-header">
                                        {place.Name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {calendar.rows.map((row) =>
                                (() => {
                                    const globalBlock = dashboard.blocks.some(
                                        (block) =>
                                            !block.Place && blockCoversDate(block, row.isoDate),
                                    );
                                    return (
                                        <tr
                                            key={row.isoDate}
                                            className={[
                                                row.isoDate === todayIso
                                                    ? 'calendar-today-row'
                                                    : '',
                                                globalBlock ? 'calendar-blocked-row' : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}>
                                            <th scope="row" className="calendar-date-cell">
                                                {row.label}
                                            </th>
                                            {row.places.map((place) => {
                                                const placeBlocked =
                                                    !globalBlock &&
                                                    dashboard.blocks.some(
                                                        (block) =>
                                                            block.Place === place.placeId &&
                                                            blockCoversDate(block, row.isoDate),
                                                    );
                                                return (
                                                    <td
                                                        key={`${row.isoDate}-${place.placeId}`}
                                                        className={`calendar-place-cell${
                                                            placeBlocked
                                                                ? ' calendar-blocked-place-cell'
                                                                : ''
                                                        }`}>
                                                        {place.blocks.map((block) => (
                                                            <button
                                                                key={block.programId}
                                                                type="button"
                                                                className="calendar-program-block"
                                                                style={{
                                                                    backgroundColor: block.color
                                                                        ? `${block.color}26`
                                                                        : undefined,
                                                                }}
                                                                onClick={() =>
                                                                    navigateToProgram(
                                                                        block.programId,
                                                                    )
                                                                }
                                                                aria-label={`Open ${block.title}`}>
                                                                <span className="calendar-program-title">
                                                                    {block.title}
                                                                </span>
                                                                {block.sessions.map((session) => (
                                                                    <span
                                                                        key={`${session.startDateTime}-${session.label}`}
                                                                        className="calendar-session-line">
                                                                        {session.label}
                                                                    </span>
                                                                ))}
                                                            </button>
                                                        ))}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })(),
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty>No approved programs scheduled.</Empty>
            )}
        </Page>
    );
}

function RequestBoard({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    const isInventory = kind === 'inventory';
    const isProgram = kind === 'programs';
    const params = new URLSearchParams(window.location.search);
    const [search, setSearch] = useState(params.get(WORKBENCH_SEARCH_QUERY_PARAM) || '');
    const [appliedSearch, setAppliedSearch] = useState(
        params.get(WORKBENCH_SEARCH_QUERY_PARAM) || '',
    );
    const [view, setView] = useState(params.get(WORKBENCH_VIEW_QUERY_PARAM) || 'active');
    const statuses = isInventory
        ? ['draft', 'submitted', 'approved', 'issued', 'closed', 'rejected', 'cancelled']
        : isProgram
          ? ['draft', 'submitted', 'approved', 'rejected', 'cancelled']
          : ['unassigned', 'pending', 'closed'];
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
        const value = params.get(WORKBENCH_STATUS_QUERY_PARAM);
        return value ? value.split(',').filter((status) => statuses.includes(status)) : statuses;
    });
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<Paginated<any> | null>(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const rows = result?.items || [];
    const open = (id: string) =>
        isInventory
            ? navigateToInventoryRequest(id)
            : isProgram
              ? navigateToProgram(id)
              : navigateToTicket(id);
    const title = isInventory ? 'Inventory' : isProgram ? 'Programs' : 'Tickets';
    const label = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);
    const updateQuery = (key: string, value: string) => {
        const url = new URL(window.location.href);
        if (value && value !== 'all') url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        replaceWorkbenchUrl(url);
    };
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const query: any = {
            q: appliedSearch,
            // An empty checkbox selection is different from an omitted filter;
            // the backend's explicit sentinel keeps it from meaning "all".
            statuses: selectedStatuses.length ? selectedStatuses : ['__none__'],
        };
        if (isProgram)
            query.dateScope = view === 'past' ? 'past' : view === 'active' ? 'ongoing-future' : '';
        const request = isInventory
            ? api.listInventoryRequests(page, query)
            : isProgram
              ? api.listProgramRequests(page, query)
              : api.listTickets(page, query);
        request
            .then((next) => {
                if (!cancelled) setResult(next);
            })
            .catch(error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [appliedSearch, isInventory, isProgram, page, selectedStatuses, view]);

    const filter = (
        <Space wrap>
            {isProgram && (
                <Select
                    value={view}
                    onChange={(value) => {
                        setView(value);
                        setPage(1);
                        updateQuery(WORKBENCH_VIEW_QUERY_PARAM, value);
                    }}>
                    <Select.Option value="all">All</Select.Option>
                    <Select.Option value="active">Future</Select.Option>
                    <Select.Option value="past">Past</Select.Option>
                </Select>
            )}
            <Select
                mode="multiple"
                maxTagCount={0}
                maxTagPlaceholder={(selected) => `${selected.length} statuses`}
                placeholder="Filter by status"
                style={{ minWidth: '7.25rem', maxWidth: '100%' }}
                value={selectedStatuses}
                onChange={(values) => {
                    const next = values.map(String);
                    setSelectedStatuses(next);
                    setPage(1);
                    updateQuery(WORKBENCH_STATUS_QUERY_PARAM, next.join(','));
                }}
                options={statuses.map((status) => ({ label: label(status), value: status }))}
            />
        </Space>
    );
    const boardFilters = (
        <Space className="antd-board-filters" wrap>
            <Input
                value={search}
                placeholder={`Search ${title.toLowerCase()}`}
                onChange={(event) => setSearch(event.target.value)}
            />
            <Button
                type="primary"
                icon={<SearchOutlined />}
                aria-label={`Search ${title.toLowerCase()}`}
                title={`Search ${title.toLowerCase()}`}
                onClick={() => {
                    setAppliedSearch(search);
                    setPage(1);
                    updateQuery(WORKBENCH_SEARCH_QUERY_PARAM, search);
                }}
            />
            {filter}
        </Space>
    );
    return (
        <Page
            className="antd-page-board"
            title={title}
            headingContent={boardFilters}
            action={
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreating(true)}
                    aria-label={`Add ${title.toLowerCase()}`}
                    title={`Add ${title.toLowerCase()}`}
                />
            }>
            <div className="antd-request-list">
                {loading && <Typography.Text type="secondary">Loading requests…</Typography.Text>}
                {!loading &&
                    rows.map((row) =>
                        isProgram ? (
                            <RequestBlock
                                key={row.Id}
                                kind="program"
                                row={row as ProgramRequestDTO}
                                dashboard={dashboard}
                                comments={row.comments}
                                onClick={() => open(row.Id)}
                            />
                        ) : isInventory ? (
                            <RequestBlock
                                key={row.Id}
                                kind="inventory"
                                row={row as InventoryRequestDTO}
                                dashboard={dashboard}
                                comments={row.comments}
                                onClick={() => open(row.Id)}
                            />
                        ) : (
                            <RequestBlock
                                key={row.Id}
                                kind="ticket"
                                row={row as TicketDTO}
                                dashboard={dashboard}
                                comments={row.comments}
                                onClick={() => open(row.Id)}
                            />
                        ),
                    )}
                {!loading && !rows.length && <AntEmpty description="No requests" />}
                {result && result.totalCount > result.pageSize && (
                    <Pagination
                        current={result.page}
                        pageSize={result.pageSize}
                        total={result.totalCount}
                        showSizeChanger={false}
                        onChange={setPage}
                    />
                )}
            </div>
            {creating && (
                <Modal
                    title={`New ${isInventory ? 'inventory request' : isProgram ? 'program request' : 'ticket'}`}
                    close={() => setCreating(false)}>
                    <CreateRecord kind={kind} dashboard={dashboard} />
                </Modal>
            )}
        </Page>
    );
}

function RequestTable({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    return <RequestBoard kind={kind} dashboard={dashboard} />;
}

function CreateRecord({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    const [users, setUsers] = useState<UserDTO[]>([]);
    const [language, setLanguage] = useState(dashboard.programLanguages[0]?.Name || '');
    const [placeId, setPlaceId] = useState('');
    const [requestedBy, setRequestedBy] = useState(dashboard.me.Email);
    const [departmentId, setDepartmentId] = useState(dashboard.me.DepartmentId);
    const initialLeadEmail =
        dashboard.departments.find((department) => department.Id === dashboard.me.DepartmentId)
            ?.LeadEmail || '';
    const [leadEmail, setLeadEmail] = useState(initialLeadEmail);
    const [programType, setProgramType] = useState(
        dashboard.programTypes[0]?.Name || OTHER_PROGRAM_TYPE,
    );
    const createPlaceOptions = dashboard.places;
    useEffect(() => {
        if ((kind === 'programs' || kind === 'inventory') && canApprove(dashboard.me)) {
            api.listUsers().then(setUsers).catch(error);
        }
    }, [dashboard.me, kind]);
    const leadEmailForDepartment = (id: string) =>
        dashboard.departments.find((department) => department.Id === id)?.LeadEmail || '';
    const selectDepartment = (id: string) => {
        setDepartmentId(id);
        setLeadEmail(leadEmailForDepartment(id));
    };
    const selectRequester = (email: string) => {
        setRequestedBy(email);
        const requester = users.find((user) => user.Email === email);
        if (requester) selectDepartment(requester.DepartmentId);
    };
    const save = useSave(async (): Promise<{ Id: string }> => {
        const d = new FormData(document.getElementById('refine-request-form') as HTMLFormElement);
        const name = String(d.get('name') || '');
        if (kind === 'tickets')
            return api.createTicket(
                { title: name, description: String(d.get('description') || '') },
                generateRequestId(),
            );
        if (kind === 'inventory')
            return api.createInventoryRequest(
                {
                    name,
                    userId: requestedBy,
                    startDate: String(d.get('startDate')),
                    endDate: String(d.get('endDate')),
                    items: [],
                    imageId: '',
                    departmentId,
                    leadEmail: String(d.get('leadEmail') || leadEmail),
                    participants: '',
                },
                generateRequestId(),
            );
        return api.createProgramRequest(
            {
                name,
                language: String(d.get('language') || ''),
                type: programType,
                userId: requestedBy,
                placeId: String(d.get('placeId') || ''),
                sessions: [],
                departmentId,
                leadEmail: String(d.get('leadEmail') || ''),
                participants: '',
            },
            generateRequestId(),
        );
    });
    return (
        <form
            id="refine-request-form"
            className="grid gap-3"
            noValidate
            onSubmit={async (e) => {
                const created = await save.run(e);
                if (!created) return;
                const id = createRecordDestination(kind, created.Id);
                if (kind === 'programs') navigateToProgram(id);
                else if (kind === 'inventory') navigateToInventoryRequest(id);
                else navigateToTicket(id);
            }}>
            {kind !== 'programs' && (
                <TextField name="name" label={kind === 'tickets' ? 'Title' : 'Name'} required />
            )}
            {kind === 'tickets' && <TextField name="description" label="Description" />}
            {kind === 'inventory' && (
                <>
                    <TextField name="startDate" label="Start date" type="date" required />
                    <TextField name="endDate" label="End date" type="date" required />
                    {canApprove(dashboard.me) && (
                        <AntForm.Item label="Requested by" required>
                            <input type="hidden" name="userId" value={requestedBy} required />
                            <Select
                                value={requestedBy}
                                onChange={selectRequester}
                                style={{ width: '100%' }}>
                                {users.map((user) => (
                                    <Select.Option key={user.Email} value={user.Email}>
                                        {user.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                    )}
                    <AntForm.Item label="Department" required>
                        <input type="hidden" name="departmentId" value={departmentId} required />
                        <Select
                            value={departmentId}
                            onChange={selectDepartment}
                            style={{ width: '100%' }}>
                            {dashboard.departments.map((department) => (
                                <Select.Option key={department.Id} value={department.Id}>
                                    {department.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="leadEmail"
                        label="Lead email"
                        type="email"
                        value={leadEmail}
                        required
                        onChange={(event) => setLeadEmail(event.target.value)}
                    />
                </>
            )}
            {kind === 'programs' && (
                <>
                    <AntForm.Item label="Language" required>
                        <input type="hidden" name="language" value={language} required />
                        <Select
                            value={language || undefined}
                            onChange={setLanguage}
                            style={{ width: '100%' }}
                            placeholder="Select language">
                            {dashboard.programLanguages.map((language) => (
                                <Select.Option key={language.Id} value={language.Name}>
                                    {language.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <AntForm.Item label="Type" required>
                        <input type="hidden" name="type" value={programType} />
                        <Select
                            value={programType}
                            onChange={setProgramType}
                            style={{ width: '100%' }}>
                            {programTypeOptions(dashboard.programTypes).map((type) => (
                                <Select.Option key={type} value={type}>
                                    {type}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="name"
                        label="Program title"
                        required={programType === OTHER_PROGRAM_TYPE}
                    />
                    <AntForm.Item label="Place">
                        <input type="hidden" name="placeId" value={placeId} />
                        <Select value={placeId} onChange={setPlaceId} style={{ width: '100%' }}>
                            <Select.Option value="">No place</Select.Option>
                            {createPlaceOptions.map((p) => (
                                <Select.Option key={p.Id} value={p.Id}>
                                    {p.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    {canApprove(dashboard.me) && (
                        <AntForm.Item label="Requested by" required>
                            <input type="hidden" name="userId" value={requestedBy} required />
                            <Select
                                value={requestedBy}
                                onChange={selectRequester}
                                style={{ width: '100%' }}>
                                {users.map((user) => (
                                    <Select.Option key={user.Email} value={user.Email}>
                                        {user.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                    )}
                    <AntForm.Item label="Department" required>
                        <input type="hidden" name="departmentId" value={departmentId} required />
                        <Select
                            value={departmentId}
                            onChange={selectDepartment}
                            style={{ width: '100%' }}>
                            {dashboard.departments.map((department) => (
                                <Select.Option key={department.Id} value={department.Id}>
                                    {department.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="leadEmail"
                        label="Lead email"
                        type="email"
                        value={leadEmail}
                        required
                        onChange={(event) => setLeadEmail(event.target.value)}
                    />
                </>
            )}
            <div>
                <SaveFooter label="Save" busy={save.busy} errorMessage={save.errorMessage} />
            </div>
        </form>
    );
}

function ProgramDetail({
    request,
    dashboard,
}: {
    request: ProgramRequestDTO;
    dashboard: DashboardPayload;
}) {
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const deletable =
        ['draft', 'cancelled'].includes(request.Status) && (canApprove(dashboard.me) || owner);
    const [editing, setEditing] = useState(false);
    const [sessions, setSessions] = useState<ProgramSession[]>(request.sessions);
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [sessionTypeError, setSessionTypeError] = useState(false);
    const [pendingAction, setPendingAction] = useState<ProgramRequestAction | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>(() =>
        defaultSessionDraft(request.sessions),
    );
    const [rescheduleDate, setRescheduleDate] = useState(() =>
        request.sessions.length ? getLocalDateFromSession(request.sessions[0].StartDateTime) : '',
    );
    const [users, setUsers] = useState<UserDTO[]>([]);
    const [values, setValues] = useState({
        Name: request.Name,
        Language: request.Language,
        Type: request.Type,
        PlaceId: request.PlaceId,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
    });
    const [availablePlaceIds, setAvailablePlaceIds] = useState<string[]>(
        dashboard.places.map((place) => place.Id),
    );
    useEffect(() => {
        api.getProgramRequest(request.Id)
            .then((detail) => {
                setSessions(detail.sessions);
                setSessionDraft(defaultSessionDraft(detail.sessions));
                setRescheduleDate(
                    detail.sessions.length
                        ? getLocalDateFromSession(detail.sessions[0].StartDateTime)
                        : '',
                );
            })
            .catch(error);
    }, [request.Id]);
    useEffect(() => {
        api.getAvailablePlaces(
            request.Id,
            sessions.map((session) => ({
                name: session.Name,
                type: session.Type,
                startDateTime: session.StartDateTime,
                endDateTime: session.EndDateTime,
            })),
        )
            .then((places) => setAvailablePlaceIds(places.map((place) => place.Id)))
            .catch(error);
    }, [request.Id, sessions]);
    const availablePlaceOptions = dashboard.places.filter((place) =>
        availablePlaceIds.includes(place.Id),
    );
    const placeOptions =
        values.PlaceId && !availablePlaceOptions.some((p) => p.Id === values.PlaceId)
            ? [
                  ...availablePlaceOptions,
                  dashboard.places.find((p) => p.Id === values.PlaceId),
              ].filter((p): p is Place => Boolean(p))
            : availablePlaceOptions;
    useEffect(() => {
        if (canApprove(dashboard.me)) api.listUsers().then(setUsers).catch(error);
    }, [dashboard.me]);
    const persistSessions = async (nextSessions: ProgramSession[]) => {
        try {
            showSavingBadge(true);
            await api.updateProgramRequest(
                request.Id,
                {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                generateRequestId(),
            );
            setSessions(nextSessions);
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const save = useSave(
        async () => {
            await api.updateProgramRequest(
                request.Id,
                {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    sessions: sessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                generateRequestId(),
            );
        },
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await api.updateProgramRequestParticipants(
                request.Id,
                { participants: serialized },
                generateRequestId(),
            );
            setValues((current) => ({ ...current, Participants: serialized }));
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
        }
    };
    const duplicate = async () => {
        try {
            showSavingBadge(true);
            const created = await api.createProgramRequest(
                buildDuplicateProgramInput(request, dashboard.me.Email),
                generateRequestId(),
            );
            await refreshDashboard();
            navigateToProgram(created.Id);
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const rescheduleSave = useSave(
        async () => {
            if (!rescheduleDate) throw new Error('Select a new first session date.');
            const nextSessions = shiftProgramSessions(sessions, rescheduleDate);
            await api.updateProgramRequest(
                request.Id,
                {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                generateRequestId(),
            );
            setSessions(nextSessions);
        },
        () => setRescheduling(false),
    );
    const editSession = (index: number | null) => {
        setSessionIndex(index);
        setSessionTypeError(false);
        setSessionDraft(index === null ? defaultSessionDraft(sessions) : { ...sessions[index] });
        setSessionOpen(true);
    };
    const saveSession = async (event: FormEvent) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        if (!sessionDraft.Type) {
            setSessionTypeError(true);
            return;
        }
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        if (new Date(sessionDraft.EndDateTime) <= new Date(sessionDraft.StartDateTime)) {
            const endInput = form.elements.namedItem('endDateTime') as HTMLInputElement | null;
            endInput?.setCustomValidity('The end date must be after the start date.');
            endInput?.reportValidity();
            return;
        }
        const endInput = form.elements.namedItem('endDateTime') as HTMLInputElement | null;
        endInput?.setCustomValidity('');
        setSessionTypeError(false);
        const nextSessions =
            sessionIndex === null
                ? [...sessions, sessionDraft]
                : sessions.map((s, i) => (i === sessionIndex ? sessionDraft : s));
        setSessionIndex(null);
        setSessionOpen(false);
        await persistSessions(nextSessions);
    };
    const perform = async (action: ProgramRequestAction) => {
        try {
            showSavingBadge(true);
            await api.performProgramRequestAction(request.Id, action, '', generateRequestId());
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const update = (key: keyof typeof values, value: string) =>
        setValues((current) => ({ ...current, [key]: value }));
    const actions = getProgramRequestActions(request, dashboard.me);
    const sessionRows = sessions.map((session, index) => ({
        ...session,
        key: `${session.StartDateTime}-${index}`,
    }));
    const sessionColumns = [
        {
            title: 'Schedule',
            key: 'schedule',
            render: (_value: unknown, session: ProgramSession) =>
                formatProgramSessionSchedule(session.StartDateTime, session.EndDateTime),
        },
        { title: 'Type', dataIndex: 'Type', key: 'Type' },
        {
            title: 'Title',
            dataIndex: 'Name',
            key: 'Name',
            render: (value: string) => value || 'Untitled',
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'right' as const,
            render: (_value: unknown, _session: ProgramSession, index: number) =>
                editable ? (
                    <Space>
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => editSession(index)}
                            aria-label="Edit session"
                        />
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setPendingDeleteSessionIndex(index)}
                            aria-label="Delete session"
                        />
                    </Space>
                ) : null,
        },
    ];
    return (
        <DetailLayout
            title={
                formatProgramName(request.Language, request.Type, request.Name) || 'Unnamed program'
            }
            action={
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={navigateToPrograms}
                        aria-label="Back to programs"
                        title="Back to programs"
                    />
                    <Button
                        aria-label="Duplicate program"
                        title="Duplicate program"
                        onClick={duplicate}>
                        Duplicate
                    </Button>
                    {sessions.length > 0 && canRescheduleProgram(request, dashboard.me) && (
                        <Button
                            onClick={() => {
                                setRescheduleDate(
                                    getLocalDateFromSession(sessions[0].StartDateTime),
                                );
                                setRescheduling(true);
                            }}>
                            Reschedule
                        </Button>
                    )}
                    <WorkflowActions
                        actions={actions}
                        onAction={(action) => setPendingAction(action as ProgramRequestAction)}
                    />
                    {deletable && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setPendingDelete(true)}
                            aria-label="Delete program"
                            title="Delete program"
                        />
                    )}
                </Space>
            }>
            <DetailSection
                title="Details"
                action={
                    editable && (
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => setEditing(true)}
                            aria-label="Edit program"
                            title="Edit program"
                        />
                    )
                }>
                <DetailFields
                    fields={[
                        ['Request number', `PRG-${request.DisplayId}`],
                        [
                            'Status',
                            <Tag color="blue" key="status">
                                {request.Status}
                            </Tag>,
                        ],
                        ['Program title', values.Name],
                        ['Language', values.Language],
                        ['Type', values.Type],
                        ['Place', request.placeName || 'None'],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', values.LeadEmail],
                        ['Requested by', request.userName],
                        [
                            'Participants',
                            <ParticipantsEditor
                                participants={
                                    values.Participants ? values.Participants.split(',') : []
                                }
                                editable={canApprove(dashboard.me) || owner}
                                onSave={saveParticipants}
                            />,
                        ],
                    ]}
                />
            </DetailSection>
            <DetailSection
                title="Sessions"
                action={
                    editable && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => editSession(null)}
                            aria-label="Add session"
                            title="Add session"
                        />
                    )
                }>
                {sessions.length ? (
                    <div className="overflow-x-auto">
                        <Table
                            rowKey="key"
                            columns={sessionColumns}
                            dataSource={sessionRows}
                            pagination={false}
                            className="sessions-table"
                            scroll={{ x: 'max-content' }}
                        />
                    </div>
                ) : (
                    <Empty>No sessions added.</Empty>
                )}
            </DetailSection>
            <DetailSection minHeight="16rem" maxHeight="32rem">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        await perform(pendingAction);
                        setPendingAction(null);
                    }}
                />
            )}
            {pendingDelete && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this program request?"
                    onCancel={() => setPendingDelete(false)}
                    onConfirm={async () => {
                        try {
                            showSavingBadge(true);
                            await api.deleteProgramRequest(request.Id, generateRequestId());
                            setPendingDelete(false);
                            await refreshDashboard();
                            navigateToPrograms();
                        } catch (e) {
                            error(e);
                        } finally {
                            showSavingBadge(false);
                        }
                    }}
                />
            )}
            {pendingDeleteSessionIndex !== null && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this session?"
                    onCancel={() => setPendingDeleteSessionIndex(null)}
                    onConfirm={async () => {
                        const nextSessions = sessions.filter(
                            (_, i) => i !== pendingDeleteSessionIndex,
                        );
                        await persistSessions(nextSessions);
                        setPendingDeleteSessionIndex(null);
                    }}
                />
            )}
            {editing && (
                <Modal title="Edit program" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <AntForm.Item label="Language" required>
                            <input type="hidden" name="language" value={values.Language} required />
                            <Select
                                value={values.Language || undefined}
                                onChange={(value) => update('Language', value)}
                                style={{ width: '100%' }}
                                placeholder="Select language">
                                {dashboard.programLanguages.map((language) => (
                                    <Select.Option key={language.Id} value={language.Name}>
                                        {language.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="name"
                            label="Program title"
                            value={values.Name}
                            required={values.Type === OTHER_PROGRAM_TYPE}
                        />
                        <AntForm.Item label="Type" required>
                            <input type="hidden" name="type" value={values.Type} />
                            <Select
                                value={values.Type}
                                onChange={(value) => update('Type', value)}
                                style={{ width: '100%' }}>
                                {programTypeOptions(dashboard.programTypes, values.Type).map(
                                    (type) => (
                                        <Select.Option key={type} value={type}>
                                            {type}
                                        </Select.Option>
                                    ),
                                )}
                            </Select>
                        </AntForm.Item>
                        <AntForm.Item label="Place">
                            <Select
                                value={values.PlaceId}
                                onChange={(value) => update('PlaceId', value)}
                                style={{ width: '100%' }}>
                                <Select.Option value="">No place</Select.Option>
                                {placeOptions.map((p) => (
                                    <Select.Option key={p.Id} value={p.Id}>
                                        {p.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        {canApprove(dashboard.me) && (
                            <AntForm.Item label="Requested by" required>
                                <input type="hidden" name="userId" value={values.UserId} required />
                                <Select
                                    value={values.UserId}
                                    onChange={(value) => update('UserId', value)}
                                    style={{ width: '100%' }}>
                                    {users.map((u) => (
                                        <Select.Option key={u.Email} value={u.Email}>
                                            {u.Name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </AntForm.Item>
                        )}
                        <AntForm.Item label="Department" required>
                            <input
                                type="hidden"
                                name="departmentId"
                                value={values.DepartmentId}
                                required
                            />
                            <Select
                                value={values.DepartmentId}
                                onChange={(value) => update('DepartmentId', value)}
                                style={{ width: '100%' }}>
                                {dashboard.departments.map((d) => (
                                    <Select.Option key={d.Id} value={d.Id}>
                                        {d.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="leadEmail"
                            label="Lead email"
                            type="email"
                            value={values.LeadEmail}
                            required
                        />
                        <div>
                            <SaveFooter
                                label="Save"
                                busy={save.busy}
                                errorMessage={save.errorMessage}
                            />
                        </div>
                    </form>
                </Modal>
            )}
            {rescheduling && (
                <Modal title="Reschedule program" close={() => setRescheduling(false)}>
                    <form className="grid gap-3" noValidate onSubmit={rescheduleSave.run}>
                        <TextField
                            name="firstSessionDate"
                            label="First session date"
                            type="date"
                            value={rescheduleDate}
                            required
                            onChange={(event) => setRescheduleDate(event.target.value)}
                        />
                        <SaveFooter
                            label="Save"
                            busy={rescheduleSave.busy}
                            errorMessage={rescheduleSave.errorMessage}
                        />
                    </form>
                </Modal>
            )}
            {sessionOpen && (
                <Modal
                    title={sessionIndex === null ? 'Add session' : 'Edit session'}
                    close={() => {
                        setSessionOpen(false);
                        setSessionIndex(null);
                    }}>
                    <SessionForm
                        draft={sessionDraft}
                        setDraft={setSessionDraft}
                        types={dashboard.sessionTypes}
                        typeError={sessionTypeError}
                        clearTypeError={() => setSessionTypeError(false)}
                        onSubmit={saveSession}
                    />
                </Modal>
            )}
        </DetailLayout>
    );
}

function SessionForm({
    draft,
    setDraft,
    types,
    typeError,
    clearTypeError,
    onSubmit,
}: {
    draft: ProgramSession;
    setDraft: (value: ProgramSession) => void;
    types: SessionType[];
    typeError: boolean;
    clearTypeError: () => void;
    onSubmit: (event: FormEvent) => void;
}) {
    const update = (key: keyof ProgramSession, value: string) =>
        setDraft({ ...draft, [key]: value });
    return (
        <form className="grid gap-3" noValidate onSubmit={onSubmit}>
            <AntForm.Item label="Session type" required>
                <Select
                    value={draft.Type}
                    onChange={(value) => {
                        update('Type', value);
                        clearTypeError();
                    }}
                    status={typeError ? 'error' : undefined}
                    style={{ width: '100%' }}>
                    <Select.Option value="" disabled>
                        Select type
                    </Select.Option>
                    {types.map((t) => (
                        <Select.Option key={t.Id} value={t.Name}>
                            {t.Name}
                        </Select.Option>
                    ))}
                </Select>
            </AntForm.Item>
            <AntForm.Item label="Session title">
                <Input value={draft.Name} onChange={(e) => update('Name', e.target.value)} />
            </AntForm.Item>
            <AntForm.Item label="Start" required>
                <Input
                    name="startDateTime"
                    type="datetime-local"
                    value={draft.StartDateTime ? draft.StartDateTime.slice(0, 16) : ''}
                    onChange={(e) => update('StartDateTime', e.target.value)}
                    required
                />
            </AntForm.Item>
            <AntForm.Item label="End" required>
                <Input
                    name="endDateTime"
                    type="datetime-local"
                    value={draft.EndDateTime ? draft.EndDateTime.slice(0, 16) : ''}
                    onChange={(e) => {
                        e.currentTarget.setCustomValidity('');
                        update('EndDateTime', e.target.value);
                    }}
                    required
                />
            </AntForm.Item>
            <div>
                <Submit label="Save" />
            </div>
        </form>
    );
}

function Activity({
    requestId,
    initialComments,
}: {
    requestId: string;
    initialComments: CommentDTO[];
}) {
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<CommentDTO[]>(initialComments);
    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!comment.trim()) return;
        try {
            showSavingBadge(true);
            const added = await api.addComment(requestId, comment.trim(), generateRequestId());
            setComment('');
            setComments((current) => [...current, added]);
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    return (
        <div className="activity-card">
            <Card title="Activity">
                <div className="activity-comments space-y-3">
                    {comments.length ? (
                        comments.map((c) => (
                            <div
                                className="border-b border-gray-200 pb-2 text-sm last:border-0"
                                key={c.Id}>
                                <div className="font-medium">
                                    {c.userName}{' '}
                                    <span className="ml-2 text-xs font-normal text-black/50">
                                        {formatDateTime(c.Timestamp)}
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap text-black/70">{c.Message}</p>
                            </div>
                        ))
                    ) : (
                        <Empty>No activity yet.</Empty>
                    )}
                </div>
                <form className="flex gap-2" onSubmit={submit}>
                    <Input
                        size="small"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add a comment"
                    />
                    <Button size="small" htmlType="submit">
                        Send
                    </Button>
                </form>
            </Card>
        </div>
    );
}

function DetailFields({ fields }: { fields: Array<[label: string, value: ReactNode]> }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-baseline gap-2">
                    <dt className="shrink-0 text-xs font-semibold text-black/50">{label}</dt>
                    <dd className="min-w-0 break-words text-sm">{value}</dd>
                </div>
            ))}
        </div>
    );
}

const PARTICIPANT_EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function ParticipantsEditor({
    participants,
    editable,
    onSave,
}: {
    participants: string[];
    editable: boolean;
    onSave: (participants: string[]) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const normalizedParticipants = participants.map((participant) => participant.toLowerCase());
    const addParticipant = async (event: FormEvent) => {
        event.preventDefault();
        const nextEmail = email.trim().toLowerCase();
        if (!PARTICIPANT_EMAIL_PATTERN.test(nextEmail)) {
            setErrorMessage('Enter a valid email address.');
            return;
        }
        if (normalizedParticipants.includes(nextEmail)) {
            setErrorMessage('That email is already a participant.');
            return;
        }
        setBusy(true);
        setErrorMessage('');
        try {
            await onSave([...normalizedParticipants, nextEmail]);
            setEmail('');
            setOpen(false);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };
    const removeParticipant = async (participant: string) => {
        setBusy(true);
        setErrorMessage('');
        try {
            await onSave(normalizedParticipants.filter((entry) => entry !== participant));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-2">
            {normalizedParticipants.map((participant) => (
                <Tag
                    key={participant}
                    closable={editable && !busy}
                    onClose={(event) => {
                        event.preventDefault();
                        void removeParticipant(participant);
                    }}>
                    {participant}
                </Tag>
            ))}
            {editable && (
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={busy}
                    aria-label="Add participant"
                    title="Add participant"
                    onClick={() => {
                        setErrorMessage('');
                        setOpen(true);
                    }}
                />
            )}
            {!normalizedParticipants.length && !editable && <Typography.Text>None</Typography.Text>}
            {errorMessage && (
                <Typography.Text type="danger" className="basis-full text-sm">
                    {errorMessage}
                </Typography.Text>
            )}
            {open && (
                <Modal title="Add participant" close={() => setOpen(false)}>
                    <form className="grid gap-3" onSubmit={addParticipant}>
                        <AntForm.Item label="Email" required>
                            <Input
                                type="email"
                                value={email}
                                autoFocus
                                onChange={(event) => setEmail(event.target.value)}
                            />
                        </AntForm.Item>
                        <SaveFooter label="Add" busy={busy} errorMessage={errorMessage} />
                    </form>
                </Modal>
            )}
        </div>
    );
}

function DetailLayout({
    title,
    action,
    children,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Page title={title} action={action} className="detail-page">
            <DetailSections>{children}</DetailSections>
        </Page>
    );
}

function WorkflowActions({
    actions,
    onAction,
}: {
    actions: string[];
    onAction: (action: string) => void;
}) {
    return (
        <Space wrap>
            {actions.map((action) => (
                <Button type="primary" key={action} onClick={() => onAction(action)}>
                    {action}
                </Button>
            ))}
        </Space>
    );
}

function InventoryDetail({
    request,
    dashboard,
}: {
    request: InventoryRequestDTO;
    dashboard: DashboardPayload;
}) {
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const deletable =
        ['draft', 'cancelled'].includes(request.Status) && (canApprove(dashboard.me) || owner);
    const [editing, setEditing] = useState(false);
    const [pendingAction, setPendingAction] = useState<InventoryRequestAction | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [pendingDeleteItemIndex, setPendingDeleteItemIndex] = useState<number | null>(null);
    const [itemIndex, setItemIndex] = useState<number | null>(null);
    const [itemOpen, setItemOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [itemError, setItemError] = useState('');
    const [imageId, setImageId] = useState(request.ImageId || '');
    const [imageUploading, setImageUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<InventoryItemDTO[]>(
        request.items.map((item) => ({ ...item })),
    );
    const [itemDraft, setItemDraft] = useState({
        InventoryTypeId: dashboard.inventoryTypes[0]?.Id || '',
        Quantity: 1,
        Condition: '' as ReturnCondition | '',
    });
    const [values, setValues] = useState({
        Name: request.Name,
        StartDate: request.StartDate,
        EndDate: request.EndDate,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
    });
    const [users, setUsers] = useState<UserDTO[]>([]);
    useEffect(() => {
        if (canApprove(dashboard.me)) api.listUsers().then(setUsers).catch(error);
    }, [dashboard.me]);
    const update = (key: keyof typeof values, value: string) =>
        setValues((current) => ({ ...current, [key]: value }));
    const persistItems = async (nextItems: InventoryItemDTO[]): Promise<boolean> => {
        try {
            setItemError('');
            showSavingBadge(true);
            await api.updateInventoryRequest(
                request.Id,
                {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    items: nextItems.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                generateRequestId(),
            );
            setItems(nextItems);
            await refreshDashboard();
            return true;
        } catch (e) {
            setItemError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            showSavingBadge(false);
        }
    };
    const scanInventoryType = async (decodedValue: string) => {
        const inventoryType = findInventoryTypeByQrValue(dashboard.inventoryTypes, decodedValue);
        if (!inventoryType) {
            setItemError('Inventory type not found for this QR code.');
            return;
        }
        const saved = await persistItems(
            addScannedInventoryItem(items, inventoryType.Id).map((item) =>
                item.InventoryTypeId === inventoryType.Id && !item.itemName
                    ? { ...item, itemName: inventoryType.Name }
                    : item,
            ),
        );
        if (saved) setScanOpen(false);
    };
    const save = useSave(
        async () => {
            await api.updateInventoryRequest(
                request.Id,
                {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    items: items.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                generateRequestId(),
            );
        },
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await api.updateInventoryRequestParticipants(
                request.Id,
                { participants: serialized },
                generateRequestId(),
            );
            setValues((current) => ({ ...current, Participants: serialized }));
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
        }
    };
    const editItem = (index: number | null) => {
        setItemIndex(index);
        setItemError('');
        setItemDraft(
            index === null
                ? {
                      InventoryTypeId: dashboard.inventoryTypes[0]?.Id || '',
                      Quantity: 1,
                      Condition: '',
                  }
                : {
                      InventoryTypeId: items[index].InventoryTypeId,
                      Quantity: items[index].Quantity,
                      Condition: items[index].Condition,
                  },
        );
        setItemOpen(true);
    };
    const saveItem = async (event: FormEvent) => {
        event.preventDefault();
        if (!itemDraft.InventoryTypeId) {
            setItemError('Select an inventory type.');
            return;
        }
        if (itemDraft.Quantity <= 0) {
            setItemError('Quantity must be greater than zero.');
            return;
        }
        const type = dashboard.inventoryTypes.find(
            (entry) => entry.Id === itemDraft.InventoryTypeId,
        );
        if (!type) {
            setItemError('Select a valid inventory type.');
            return;
        }
        setItemError('');
        const nextItem = {
            ...itemDraft,
            itemName: type.Name,
        };
        const nextItems =
            itemIndex === null
                ? [...items, nextItem]
                : items.map((item, index) =>
                      index === itemIndex ? { ...item, ...nextItem } : item,
                  );
        setItemIndex(null);
        setItemOpen(false);
        await persistItems(nextItems);
    };
    const uploadRequestImage = async (file: File) => {
        if (!file) return;
        try {
            setImageUploading(true);
            showSavingBadge(true);
            const prepared = await prepareInventoryImage(file);
            const nextImageId = await api.uploadImage(
                prepared.base64Data,
                prepared.fileName,
                prepared.mimeType,
            );
            await api.updateInventoryRequest(
                request.Id,
                {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    imageId: nextImageId,
                    items: items.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                generateRequestId(),
            );
            setImageId(nextImageId);
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            setImageUploading(false);
            showSavingBadge(false);
        }
    };
    const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadRequestImage(file);
    };
    const perform = async (action: InventoryRequestAction) => {
        try {
            showSavingBadge(true);
            await api.performInventoryRequestAction(
                request.Id,
                action,
                '',
                null,
                generateRequestId(),
            );
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const actions = (
        ['submit', 'approve', 'reject', 'issue', 'close', 'cancel'] as InventoryRequestAction[]
    )
        .filter((action) => canTransitionInventoryRequest(request.Status, action))
        .filter(
            (action) =>
                action !== 'close' ||
                request.Status !== 'issued' ||
                (items.length > 0 && items.every((item) => Boolean(item.Condition))),
        )
        .filter((action) => (action === 'submit' ? owner : canApprove(dashboard.me)));
    return (
        <DetailLayout
            title={request.Name || 'Unnamed request'}
            action={
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={navigateToInventoryRequests}
                        aria-label="Back to inventory requests"
                        title="Back to inventory requests"
                    />
                    <WorkflowActions
                        actions={actions}
                        onAction={(action) => setPendingAction(action as InventoryRequestAction)}
                    />
                    {deletable && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setPendingDelete(true)}
                            aria-label="Delete request"
                            title="Delete request"
                        />
                    )}
                </Space>
            }>
            <DetailSection
                title="Details"
                action={
                    editable && (
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => setEditing(true)}
                            aria-label="Edit request"
                            title="Edit request"
                        />
                    )
                }>
                <DetailFields
                    fields={[
                        ['Request number', `REQ-${request.DisplayId}`],
                        [
                            'Status',
                            <Tag color="blue" key="status">
                                {request.Status}
                            </Tag>,
                        ],
                        ['Request name', values.Name],
                        ['Start date', values.StartDate],
                        ['End date', values.EndDate],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', values.LeadEmail],
                        ['Requested by', request.userName || 'Unknown'],
                        [
                            'Participants',
                            <ParticipantsEditor
                                participants={
                                    values.Participants ? values.Participants.split(',') : []
                                }
                                editable={canApprove(dashboard.me) || owner}
                                onSave={saveParticipants}
                            />,
                        ],
                    ]}
                />
            </DetailSection>
            <DetailSection
                title="Requested items"
                action={
                    editable && (
                        <Space>
                            <Button
                                type="primary"
                                icon={<CameraOutlined />}
                                onClick={() => {
                                    setItemError('');
                                    setScanOpen(true);
                                }}
                                aria-label="Scan requested item"
                                title="Scan requested item"
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => editItem(null)}
                                aria-label="Add item"
                                title="Add item"
                            />
                        </Space>
                    )
                }>
                {items.length ? (
                    <div className="overflow-x-auto">
                        <Table
                            rowKey={(item) => `${item.InventoryTypeId}-${item.Quantity}`}
                            pagination={false}
                            dataSource={items}
                            columns={[
                                {
                                    title: 'Item',
                                    key: 'item',
                                    render: (_value: unknown, item: InventoryItemDTO) => (
                                        <Space size={6}>
                                            <Typography.Text type="secondary">
                                                {item.Quantity}×
                                            </Typography.Text>
                                            <Typography.Text strong>
                                                {item.itemName || 'Unknown item'}
                                            </Typography.Text>
                                        </Space>
                                    ),
                                },
                                {
                                    title: 'Condition',
                                    dataIndex: 'Condition',
                                    key: 'Condition',
                                    render: (value: string) => value || '—',
                                },
                                {
                                    title: 'Actions',
                                    key: 'actions',
                                    align: 'right' as const,
                                    render: (
                                        _value: unknown,
                                        _item: InventoryItemDTO,
                                        index: number,
                                    ) =>
                                        editable ? (
                                            <Space>
                                                <Button
                                                    type="text"
                                                    icon={<EditOutlined />}
                                                    onClick={() => editItem(index)}
                                                    aria-label="Edit item"
                                                />
                                                <Button
                                                    type="text"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => setPendingDeleteItemIndex(index)}
                                                    aria-label="Delete item"
                                                />
                                            </Space>
                                        ) : null,
                                },
                            ]}
                            className="inventory-items-table"
                            scroll={{ x: 'max-content' }}
                        />
                    </div>
                ) : (
                    <Empty>No items added.</Empty>
                )}
            </DetailSection>
            <DetailSection
                title="Image"
                action={
                    editable && (
                        <>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageFileChange}
                            />
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<CameraOutlined />}
                                    loading={imageUploading}
                                    onClick={() => setCameraOpen(true)}
                                    aria-label={
                                        imageId ? 'Replace image with camera' : 'Take photo'
                                    }
                                    title={imageId ? 'Replace image with camera' : 'Take photo'}
                                />
                                <Button
                                    type="primary"
                                    icon={<UploadOutlined />}
                                    loading={imageUploading}
                                    onClick={() => imageInputRef.current?.click()}
                                    aria-label={imageId ? 'Replace image' : 'Add image'}
                                    title={imageId ? 'Replace image' : 'Add image'}
                                />
                            </Space>
                        </>
                    )
                }>
                <div className="inventory-request-image-frame">
                    {imageUrlForDriveId(imageId) ? (
                        <img
                            src={imageUrlForDriveId(imageId)}
                            alt="Inventory request"
                            className="inventory-request-image"
                        />
                    ) : (
                        <Typography.Text type="secondary">No image added.</Typography.Text>
                    )}
                </div>
            </DetailSection>
            <DetailSection minHeight="16rem" maxHeight="32rem">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {editing && (
                <Modal title="Edit inventory request" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <TextField
                            name="name"
                            label="Request name"
                            value={values.Name}
                            required
                            onChange={(e) => update('Name', e.target.value)}
                        />
                        <TextField
                            name="startDate"
                            label="Start date"
                            type="date"
                            value={values.StartDate}
                            required
                            onChange={(e) => update('StartDate', e.target.value)}
                        />
                        <TextField
                            name="endDate"
                            label="End date"
                            type="date"
                            value={values.EndDate}
                            required
                            onChange={(e) => update('EndDate', e.target.value)}
                        />
                        {canApprove(dashboard.me) && (
                            <AntForm.Item label="Requested by" required>
                                <input type="hidden" name="userId" value={values.UserId} required />
                                <Select
                                    value={values.UserId}
                                    onChange={(value) => update('UserId', value)}
                                    style={{ width: '100%' }}>
                                    {users.map((user) => (
                                        <Select.Option key={user.Email} value={user.Email}>
                                            {user.Name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </AntForm.Item>
                        )}
                        <AntForm.Item label="Department" required>
                            <input
                                type="hidden"
                                name="departmentId"
                                value={values.DepartmentId}
                                required
                            />
                            <Select
                                value={values.DepartmentId}
                                onChange={(value) => update('DepartmentId', value)}
                                style={{ width: '100%' }}>
                                {dashboard.departments.map((department) => (
                                    <Select.Option key={department.Id} value={department.Id}>
                                        {department.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="leadEmail"
                            label="Lead email"
                            type="email"
                            value={values.LeadEmail}
                            required
                            onChange={(e) => update('LeadEmail', e.target.value)}
                        />
                        <div>
                            <SaveFooter
                                label="Save"
                                busy={save.busy}
                                errorMessage={save.errorMessage}
                            />
                        </div>
                    </form>
                </Modal>
            )}
            {scanOpen && (
                <Modal
                    title="Scan inventory type"
                    close={() => {
                        setScanOpen(false);
                        setItemError('');
                    }}>
                    <div className="grid gap-3">
                        <QrScanner onScan={scanInventoryType} onError={setItemError} />
                        {itemError && <Typography.Text type="danger">{itemError}</Typography.Text>}
                    </div>
                </Modal>
            )}
            {cameraOpen && (
                <Modal title="Take photo" close={() => setCameraOpen(false)}>
                    <ImageCamera
                        onCapture={async (file) => {
                            setCameraOpen(false);
                            await uploadRequestImage(file);
                        }}
                    />
                </Modal>
            )}
            {itemOpen && (
                <Modal
                    title={itemIndex === null ? 'Add item' : 'Edit item'}
                    close={() => {
                        setItemOpen(false);
                        setItemIndex(null);
                    }}>
                    <form className="grid gap-3" noValidate onSubmit={saveItem}>
                        <AntForm.Item label="Inventory type" required>
                            <Select
                                value={itemDraft.InventoryTypeId}
                                onChange={(value) =>
                                    setItemDraft((current) => ({
                                        ...current,
                                        InventoryTypeId: value,
                                    }))
                                }
                                style={{ width: '100%' }}>
                                {dashboard.inventoryTypes.map((type) => (
                                    <Select.Option key={type.Id} value={type.Id}>
                                        {type.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="quantity"
                            label="Quantity"
                            type="number"
                            value={itemDraft.Quantity}
                            required
                            onChange={(event) =>
                                setItemDraft((current) => ({
                                    ...current,
                                    Quantity: Number(event.target.value),
                                }))
                            }
                        />
                        <AntForm.Item label="Condition">
                            <Select
                                value={itemDraft.Condition}
                                onChange={(value) =>
                                    setItemDraft((current) => ({
                                        ...current,
                                        Condition: value as ReturnCondition | '',
                                    }))
                                }
                                style={{ width: '100%' }}>
                                <Select.Option value="">Not specified</Select.Option>
                                <Select.Option value="returned">Returned</Select.Option>
                                <Select.Option value="damaged">Damaged</Select.Option>
                                <Select.Option value="missing">Missing</Select.Option>
                            </Select>
                        </AntForm.Item>
                        <div>
                            <SaveFooter label="Save" errorMessage={itemError} />
                        </div>
                    </form>
                </Modal>
            )}
            {pendingDeleteItemIndex !== null && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this item?"
                    onCancel={() => setPendingDeleteItemIndex(null)}
                    onConfirm={async () => {
                        const nextItems = items.filter(
                            (_, index) => index !== pendingDeleteItemIndex,
                        );
                        await persistItems(nextItems);
                        setPendingDeleteItemIndex(null);
                    }}
                />
            )}
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        await perform(pendingAction);
                        setPendingAction(null);
                    }}
                />
            )}
            {pendingDelete && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this inventory request?"
                    onCancel={() => setPendingDelete(false)}
                    onConfirm={async () => {
                        try {
                            showSavingBadge(true);
                            await api.deleteInventoryRequest(request.Id, generateRequestId());
                            setPendingDelete(false);
                            await refreshDashboard();
                            navigateToInventoryRequests();
                        } catch (e) {
                            error(e);
                        } finally {
                            showSavingBadge(false);
                        }
                    }}
                />
            )}
        </DetailLayout>
    );
}

function TicketDetail({ ticket, dashboard }: { ticket: TicketDTO; dashboard: DashboardPayload }) {
    const [editing, setEditing] = useState(false);
    const [pendingAction, setPendingAction] = useState<TicketAction | null>(null);
    const [values, setValues] = useState({ Title: ticket.Title, Description: ticket.Description });
    const save = useSave(
        async () =>
            api.updateTicket(
                ticket.Id,
                { title: values.Title, description: values.Description },
                generateRequestId(),
            ),
        () => setEditing(false),
    );
    const actions = (['close', 'reopen'] as TicketAction[]).filter((action) =>
        canTransitionTicket(ticket.Status, action),
    );
    const perform = async (action: TicketAction) => {
        try {
            showSavingBadge(true);
            await api.performTicketAction(ticket.Id, action, null, generateRequestId());
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    return (
        <DetailLayout
            title={`TKT-${ticket.DisplayId} · ${ticket.Title || 'Untitled ticket'}`}
            action={
                <WorkflowActions
                    actions={actions}
                    onAction={(action) => setPendingAction(action as TicketAction)}
                />
            }>
            <DetailSection
                title="Details"
                action={
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(true)}
                        aria-label="Edit ticket"
                        title="Edit ticket"
                    />
                }>
                <DetailFields
                    fields={[
                        [
                            'Status',
                            <Tag color="blue" key="status">
                                {ticket.Status}
                            </Tag>,
                        ],
                        ['Title', values.Title],
                        ['Assigned to', ticket.assigneeName || 'Unassigned'],
                    ]}
                />
                <div className="mt-4 sm:col-span-2">
                    <dt className="text-xs font-semibold text-black/50">Description</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm">
                        {values.Description || 'No description.'}
                    </dd>
                </div>
            </DetailSection>
            <DetailSection minHeight="16rem" maxHeight="32rem">
                <Activity requestId={ticket.Id} initialComments={ticket.comments} />
            </DetailSection>
            {editing && (
                <Modal title="Edit ticket" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <TextField
                            name="title"
                            label="Title"
                            value={values.Title}
                            required
                            onChange={(e) => setValues({ ...values, Title: e.target.value })}
                        />
                        <AntForm.Item label="Description">
                            <Input.TextArea
                                value={values.Description}
                                onChange={(e) =>
                                    setValues({ ...values, Description: e.target.value })
                                }
                                rows={5}
                            />
                        </AntForm.Item>
                        <div>
                            <SaveFooter
                                label="Save"
                                busy={save.busy}
                                errorMessage={save.errorMessage}
                            />
                        </div>
                    </form>
                </Modal>
            )}
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        await perform(pendingAction);
                        setPendingAction(null);
                    }}
                />
            )}
        </DetailLayout>
    );
}

function Detail({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get(
        kind === 'inventory'
            ? 'inventoryRequest'
            : kind === 'programs'
              ? 'programRequest'
              : 'ticket',
    );
    const rows: any[] =
        kind === 'inventory'
            ? dashboard.inventoryRequests
            : kind === 'programs'
              ? dashboard.programRequests
              : dashboard.tickets;
    const row = rows.find((r) => r.Id === id);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const back =
        kind === 'inventory'
            ? navigateToInventoryRequests
            : kind === 'programs'
              ? navigateToPrograms
              : navigateToTickets;
    if (!row)
        return params.get('mode') === 'create' ? (
            <CreateRecord kind={kind} dashboard={dashboard} />
        ) : (
            <Page title="Not found">
                <Card title="Record not found">
                    <Button onClick={back}>Back</Button>
                </Card>
            </Page>
        );
    if (kind === 'inventory')
        return <InventoryDetail request={row as InventoryRequestDTO} dashboard={dashboard} />;
    if (kind === 'tickets') return <TicketDetail ticket={row as TicketDTO} dashboard={dashboard} />;
    const title = row.Name;
    const actions = ['submit', 'approve', 'reject', 'cancel'];
    const applyAction = async (action: string) => {
        try {
            showSavingBadge(true);
            await api.performProgramRequestAction(
                row.Id,
                action as ProgramRequestAction,
                '',
                generateRequestId(),
            );
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    return (
        <DetailLayout
            title={title}
            action={
                <Button type="link" onClick={back}>
                    Back
                </Button>
            }>
            <DetailSection title="Details">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-black/50">Status</dt>
                        <dd>
                            <Tag>{row.Status}</Tag>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-black/50">Requested by</dt>
                        <dd>{row.userName || row.assigneeName || '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs text-black/50">Description</dt>
                        <dd className="whitespace-pre-wrap">
                            {row.Description || 'No description.'}
                        </dd>
                    </div>
                </dl>
            </DetailSection>
            <DetailSection title="Actions">
                <div className="flex flex-wrap gap-2">
                    {actions.map((action) => (
                        <Button size="small" key={action} onClick={() => setPendingAction(action)}>
                            {action}
                        </Button>
                    ))}
                </div>
            </DetailSection>
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        await applyAction(pendingAction);
                        setPendingAction(null);
                    }}
                />
            )}
        </DetailLayout>
    );
}

export function renderRefineApp(
    section: string,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    const params = new URLSearchParams(window.location.search);
    if (section === 'programs' && params.get('programRequest')) {
        const request = dashboard.programRequests.find(
            (item) => item.Id === params.get('programRequest'),
        );
        if (request) {
            mountRefinePage(
                container,
                <ProgramDetail request={request} dashboard={dashboard} />,
                'programs',
            );
            return;
        }
    }
    let page: ReactNode;
    if (section === 'home') page = <Home dashboard={dashboard} />;
    else if (section === 'profile') page = <Profile dashboard={dashboard} />;
    else if (section === 'users') page = <Users dashboard={dashboard} />;
    else if (section === 'roster') page = <Roster dashboard={dashboard} />;
    else if (section === 'calendar') page = <Calendar dashboard={dashboard} />;
    else if (['inventory', 'programs', 'tickets'].includes(section)) {
        const detail =
            Boolean(
                params.get(
                    section === 'inventory'
                        ? 'inventoryRequest'
                        : section === 'programs'
                          ? 'programRequest'
                          : 'ticket',
                ),
            ) || params.get('mode') === 'create';
        page = detail ? (
            <Detail kind={section as 'inventory' | 'programs' | 'tickets'} dashboard={dashboard} />
        ) : (
            <RequestTable
                kind={section as 'inventory' | 'programs' | 'tickets'}
                dashboard={dashboard}
            />
        );
    } else page = <Home dashboard={dashboard} />;
    mountRefinePage(container, page, section);
}

export function renderRefineRegistration(
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    mountRefinePage(container, <Profile dashboard={dashboard} registration />, 'registration');
}
