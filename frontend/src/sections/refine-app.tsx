import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
    Button,
    Card as AntCard,
    Empty as AntEmpty,
    Form as AntForm,
    Input,
    Modal as AntModal,
    Select,
    Space,
    Tag,
    Table,
    Typography,
} from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    CheckOutlined,
    CloseOutlined,
    PhoneOutlined,
    PlusOutlined,
    SearchOutlined,
    SendOutlined,
    StopOutlined,
    RollbackOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryRequest,
    navigateToInventoryRequests,
    navigateToProgram,
    navigateToPrograms,
    navigateToTicket,
    navigateToTickets,
    refreshDashboard,
    replaceWorkbenchUrl,
} from '../router';
import { WORKBENCH_SEARCH_QUERY_PARAM, WORKBENCH_VIEW_QUERY_PARAM } from '../config';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import {
    formatDateTime,
    formatProgramDateRange,
    formatProgramSessionSchedule,
    formatRosterSchedule,
} from '../ui/format';
import {
    buildRosterTableModel,
    formatRosterTableTimes,
    getShiftPresetTimes,
} from '../ui/roster-table';
import { roleLabel } from '../ui/styles';
import { createRecordDestination } from '../ui/create-record';
import {
    canApprove,
    canManageConfig,
    canTransitionInventoryRequest,
    canTransitionTicket,
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

function workflowActionIcon(
    action: ProgramRequestAction | InventoryRequestAction | TicketAction,
): ReactNode {
    if (action === 'submit') return <SendOutlined />;
    if (action === 'approve') return <CheckOutlined />;
    if (action === 'issue') return <CheckOutlined />;
    if (action === 'return') return <RollbackOutlined />;
    if (action === 'reject') return <CloseOutlined />;
    if (action === 'assign') return <CheckOutlined />;
    if (action === 'reopen') return <RollbackOutlined />;
    return <StopOutlined />;
}

function Page({
    title,
    headingContent,
    action,
    className,
    children,
}: {
    title: string;
    headingContent?: ReactNode;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={`antd-page${className ? ` ${className}` : ''}`}>
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>{title}</Typography.Title>
                </div>
                {headingContent}
                {action}
            </div>
            {children}
        </section>
    );
}
function Card({
    title,
    action,
    children,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <AntCard title={title} extra={action}>
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
const PARTICIPANTS_EMAIL_PATTERN =
    '[^\\s@,]+@[^\\s@,]+\\.[^\\s@,]+(?:\\s*,\\s*[^\\s@,]+@[^\\s@,]+\\.[^\\s@,]+)*';
const PARTICIPANTS_EMAIL_TITLE =
    'Enter valid email addresses separated by commas, for example person@example.com, other@example.com.';
function isValidInternationalPhone(phone: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(phone);
}

function Home({ dashboard }: Props) {
    const cards = [
        ['Inventory requests', dashboard.inventoryRequests.length, 'inventory'],
        ['Program requests', dashboard.programRequests.length, 'programs'],
        ['Tickets', dashboard.tickets.length, 'tickets'],
        ['Upcoming shifts', dashboard.upcomingRosters.length, 'roster'],
    ];
    return (
        <Page title="Home">
            <div className="antd-stat-grid">
                {cards.map(([label, count, section]) => (
                    <AntCard
                        key={String(section)}
                        hoverable
                        onClick={() =>
                            document
                                .querySelector<HTMLElement>(`[data-nav-section="${section}"]`)
                                ?.click()
                        }>
                        <Space direction="vertical" size={2}>
                            <Typography.Text type="secondary">{label}</Typography.Text>
                            <Typography.Title level={1}>{count}</Typography.Title>
                            <Typography.Link>Open section →</Typography.Link>
                        </Space>
                    </AntCard>
                ))}
            </div>
            <div className="antd-two-column">
                <Card title="Recent inventory requests">
                    {dashboard.inventoryRequests.slice(0, 5).map((r) => (
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
                <Card title="Upcoming roster">
                    {dashboard.upcomingRosters.slice(0, 5).map((r) => (
                        <div className="antd-list-row" key={r.Id}>
                            <span className="font-medium">{r.Name}</span>
                            <span>{formatRosterSchedule(r)}</span>
                        </div>
                    ))}
                    {!dashboard.upcomingRosters.length && <Empty />}
                </Card>
            </div>
            {dashboard.homeContent.Guidelines && (
                <Card title="Guidelines">
                    <p className="whitespace-pre-wrap text-sm text-base-content/75">
                        {dashboard.homeContent.Guidelines}
                    </p>
                </Card>
            )}
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
        if (!departmentIdValue) throw new Error('Department is required.');
        await api.updateOwnProfile({
            name: String(d.get('name')),
            departmentId: departmentIdValue,
            phone,
            whatsapp: String(d.get('whatsapp') || ''),
        });
    });
    return (
        <Page title={registration ? 'Welcome' : 'Profile'}>
            <Card title={registration ? 'Get started' : me.Name}>
                <form
                    id={registration ? 'registration-form' : 'profile-form'}
                    className="grid gap-3 sm:grid-cols-2"
                    noValidate
                    onSubmit={save.run}>
                    <TextField name="name" label="Name" value={me.Name} required />
                    <AntForm.Item label="Department" required>
                        <input type="hidden" name="departmentId" value={departmentId} required />
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
                    <TextField name="whatsapp" label="WhatsApp" value={me.Whatsapp} required />
                    {!registration && (
                        <div className="text-sm text-base-content/60 sm:col-span-2">
                            {me.Email} · <Tag color="blue">{roleLabel(me.Role)}</Tag>
                        </div>
                    )}
                    <div className="sm:col-span-2">
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
                <TextField name="whatsapp" label="WhatsApp" value={user?.Whatsapp} required />
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
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState('');
    const shown = dashboard.users;
    const filteredUsers = shown.filter((user) =>
        [user.Name, user.Email, user.departmentName, user.Role, user.Phone, user.Whatsapp]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase()),
    );
    return (
        <Page
            title="Users"
            action={
                canManageConfig(dashboard.me) && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}>
                        Add
                    </Button>
                )
            }>
            <Card title="Users" action={<Tag>{shown.length}</Tag>}>
                <div className="antd-table-search">
                    <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search users"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                {filteredUsers.length ? (
                    <Table
                        rowKey="Email"
                        dataSource={filteredUsers}
                        pagination={false}
                        className="users-table"
                        scroll={{ x: 'max-content' }}
                        columns={[
                            {
                                title: 'Name',
                                dataIndex: 'Name',
                                render: (name: string, user: UserDTO) => (
                                    <Space direction="vertical" size={0}>
                                        <Typography.Text strong>{name}</Typography.Text>
                                        <Typography.Text type="secondary">
                                            {user.Email}
                                        </Typography.Text>
                                    </Space>
                                ),
                            },
                            {
                                title: 'Department',
                                dataIndex: 'departmentName',
                                render: (value: string) => value || 'No department',
                            },
                            {
                                title: 'Role',
                                dataIndex: 'Role',
                                render: (value: UserRole) => (
                                    <Tag color="blue">{roleLabel(value)}</Tag>
                                ),
                            },
                            {
                                title: 'Contact',
                                render: (_: unknown, user: UserDTO) => (
                                    <Space direction="vertical" size={0}>
                                        <span>
                                            <PhoneOutlined /> {user.Phone || '—'}
                                        </span>
                                        <span>
                                            <WhatsAppOutlined /> {user.Whatsapp || '—'}
                                        </span>
                                    </Space>
                                ),
                            },
                            {
                                title: '',
                                key: 'actions',
                                align: 'right' as const,
                                render: (_: unknown, user: UserDTO) =>
                                    canManageConfig(dashboard.me) ? (
                                        <Button
                                            type="text"
                                            icon={<EditOutlined />}
                                            onClick={() => setEditing(user)}
                                            aria-label="Edit"
                                        />
                                    ) : null,
                            },
                        ]}
                    />
                ) : (
                    <Empty>No users yet.</Empty>
                )}
            </Card>
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
    const todayIso = formatLocalDateOnly(new Date());
    const rosterTable = buildRosterTableModel(dashboard.upcomingRosters, todayIso);
    useEffect(() => {
        if (canEdit) api.listUsers().then(setUsers).catch(error);
    }, [canEdit]);
    const Form = ({ row }: { row?: RosterDTO }) => {
        const [userId, setUserId] = useState(row?.UserId || '');
        const initialPreset = dashboard.shiftPresets.find((preset) => preset.Name === row?.Name);
        const [presetId, setPresetId] = useState(initialPreset?.Id || '');
        const [startTime, setStartTime] = useState(
            row?.StartTime || initialPreset?.DefaultStartTime || '',
        );
        const [endTime, setEndTime] = useState(row?.EndTime || initialPreset?.DefaultEndTime || '');
        const selectPreset = (nextPresetId: string) => {
            setPresetId(nextPresetId);
            const times = getShiftPresetTimes(dashboard.shiftPresets, nextPresetId);
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
                                dashboard.shiftPresets.find((preset) => preset.Id === presetId)
                                    ?.Name || ''
                            }
                            required
                        />
                        <Select value={presetId} onChange={selectPreset} style={{ width: '100%' }}>
                            <Select.Option value="" disabled>
                                Select a shift
                            </Select.Option>
                            {dashboard.shiftPresets.map((preset) => (
                                <Select.Option key={preset.Id} value={preset.Id}>
                                    {preset.Name}
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
                                }}>
                                Delete
                            </Button>
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
                        onClick={() => setCreating(true)}>
                        Add
                    </Button>
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
                                    <tr key={row.isoDate}>
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

function RequestBoard({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    const isInventory = kind === 'inventory';
    const isProgram = kind === 'programs';
    const rows: any[] = isInventory
        ? dashboard.inventoryRequests
        : isProgram
          ? dashboard.programRequests
          : dashboard.tickets;
    const params = new URLSearchParams(window.location.search);
    const [search, setSearch] = useState(params.get(WORKBENCH_SEARCH_QUERY_PARAM) || '');
    const [view, setView] = useState(
        params.get(WORKBENCH_VIEW_QUERY_PARAM) || (isProgram ? 'active' : 'all'),
    );
    const [creating, setCreating] = useState(false);
    const statuses = isInventory
        ? [
              'draft',
              'submitted',
              'approved',
              'issued',
              'returned',
              'closed',
              'rejected',
              'cancelled',
          ]
        : isProgram
          ? ['draft', 'submitted', 'approved', 'rejected', 'cancelled']
          : ['unassigned', 'pending', 'closed'];
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
    const isActive = (row: any) => {
        if (kind === 'tickets') return row.Status !== 'closed';
        const now = Date.now();
        if (kind === 'inventory')
            return !row.EndDate || new Date(`${row.EndDate}T23:59:59`).getTime() >= now;
        const ends = (row.sessions || [])
            .map((session: ProgramSession) => new Date(session.EndDateTime).getTime())
            .filter(Number.isFinite);
        return !ends.length || Math.max(...ends) >= now;
    };
    const matches = (row: any) => {
        const haystack = JSON.stringify(row).toLowerCase();
        const textMatch = !search || haystack.includes(search.toLowerCase());
        return (
            textMatch &&
            (!isProgram || view === 'all' || (view === 'active' ? isActive(row) : !isActive(row)))
        );
    };
    const filteredRows = rows.filter(matches);
    const filter = isProgram ? (
        <Select
            size="middle"
            className="antd-board-filter-select"
            value={view}
            onChange={(value) => {
                setView(value);
                updateQuery(WORKBENCH_VIEW_QUERY_PARAM, value);
            }}>
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="active">Future</Select.Option>
            <Select.Option value="past">Past</Select.Option>
        </Select>
    ) : null;
    const boardFilters = (
        <Space className="antd-board-filters" wrap>
            <Input
                prefix={<SearchOutlined />}
                value={search}
                placeholder={`Search ${title.toLowerCase()}`}
                onChange={(event) => {
                    setSearch(event.target.value);
                    updateQuery(WORKBENCH_SEARCH_QUERY_PARAM, event.target.value);
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
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                    New
                </Button>
            }>
            <div className="antd-board">
                {statuses.map((status) => {
                    const column = filteredRows.filter((row) => row.Status === status);
                    return (
                        <section className="antd-board-column" key={status}>
                            <div className="antd-board-column-heading">
                                <Typography.Text strong>{label(status)}</Typography.Text>
                                <Tag>{column.length}</Tag>
                            </div>
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                {column.map((row) => (
                                    <AntCard
                                        size="small"
                                        hoverable
                                        key={row.Id}
                                        onClick={() => open(row.Id)}>
                                        <Space direction="vertical" size={2}>
                                            {isProgram ? (
                                                <>
                                                    <Typography.Text strong>
                                                        {`PRG-${row.DisplayId}`} ·{' '}
                                                        {formatProgramName(
                                                            row.Language,
                                                            row.Type,
                                                            row.Name,
                                                        ) || 'Unnamed program'}
                                                    </Typography.Text>
                                                    <Typography.Text type="secondary">
                                                        {formatProgramDateRange(row.sessions || [])}
                                                    </Typography.Text>
                                                    <Typography.Text type="secondary">
                                                        {row.userName || 'Unknown requester'} |{' '}
                                                        {dashboard.departments.find(
                                                            (department) =>
                                                                department.Id ===
                                                                dashboard.users.find(
                                                                    (user) =>
                                                                        user.Email === row.UserId,
                                                                )?.DepartmentId,
                                                        )?.ShortName || '—'}
                                                    </Typography.Text>
                                                </>
                                            ) : (
                                                <>
                                                    <Typography.Text type="secondary">
                                                        {isInventory
                                                            ? `REQ-${row.DisplayId}`
                                                            : `TKT-${row.DisplayId}`}
                                                    </Typography.Text>
                                                    <Typography.Text strong>
                                                        {isInventory ? row.Name : row.Title}
                                                    </Typography.Text>
                                                    <Typography.Text type="secondary">
                                                        {isInventory
                                                            ? row.userName
                                                            : row.assigneeName || 'Unassigned'}
                                                    </Typography.Text>
                                                </>
                                            )}
                                        </Space>
                                    </AntCard>
                                ))}
                                {!column.length && (
                                    <AntEmpty
                                        image={AntEmpty.PRESENTED_IMAGE_SIMPLE}
                                        description="No requests"
                                    />
                                )}
                            </Space>
                        </section>
                    );
                })}
            </div>
            {!filteredRows.length && <Empty>No matching records.</Empty>}
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
                    participants: String(d.get('participants') || ''),
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
                participants: String(d.get('participants') || ''),
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
                    <TextField
                        name="participants"
                        label="Participants (emails, comma-separated)"
                        pattern={PARTICIPANTS_EMAIL_PATTERN}
                        title={PARTICIPANTS_EMAIL_TITLE}
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
                            {dashboard.places.map((p) => (
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
                    <TextField
                        name="participants"
                        label="Participants (emails, comma-separated)"
                        pattern={PARTICIPANTS_EMAIL_PATTERN}
                        title={PARTICIPANTS_EMAIL_TITLE}
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
    const [editing, setEditing] = useState(false);
    const [sessions, setSessions] = useState<ProgramSession[]>(request.sessions);
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [sessionTypeError, setSessionTypeError] = useState(false);
    const [pendingAction, setPendingAction] = useState<ProgramRequestAction | null>(null);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>(() =>
        defaultSessionDraft(request.sessions),
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
    const actions: ProgramRequestAction[] =
        request.Status === 'draft' && owner
            ? ['submit', ...(canApprove(dashboard.me) ? ['cancel' as ProgramRequestAction] : [])]
            : canApprove(dashboard.me)
              ? request.Status === 'submitted'
                  ? ['approve', 'reject']
                  : request.Status === 'approved'
                    ? ['cancel']
                    : []
              : [];
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
                formatProgramName(request.Language, request.Type, request.Name) ||
                `PRG-${request.DisplayId}`
            }
            action={
                <WorkflowActions
                    actions={actions}
                    onAction={(action) => setPendingAction(action as ProgramRequestAction)}
                    icon={(action) => workflowActionIcon(action as ProgramRequestAction)}
                />
            }>
            <div className="detail-main min-w-0">
                <Card
                    title="Details"
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => setEditing(true)}>
                                Edit
                            </Button>
                        )
                    }>
                    <DetailFields
                        fields={[
                            ['Status', <Tag key="status">{request.Status}</Tag>],
                            ['Program title', values.Name],
                            ['Language', values.Language],
                            ['Type', values.Type],
                            ['Place', request.placeName || 'None'],
                            ['Department', request.departmentName || 'None'],
                            ['Lead email', values.LeadEmail],
                            ['Requested by', request.userName],
                            ['Participants', values.Participants || 'None'],
                        ]}
                    />
                </Card>
                <Card
                    title="Sessions"
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => editSession(null)}>
                                Add
                            </Button>
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
                </Card>
            </div>
            <div className="detail-activity">
                <Activity comments={request.comments || []} requestId={request.Id} />
            </div>
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
                                {dashboard.places.map((p) => (
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
                        <TextField
                            name="participants"
                            label="Participants (emails, comma-separated)"
                            value={values.Participants}
                            pattern={PARTICIPANTS_EMAIL_PATTERN}
                            title={PARTICIPANTS_EMAIL_TITLE}
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

function Activity({ comments, requestId }: { comments: CommentDTO[]; requestId: string }) {
    const [comment, setComment] = useState('');
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!comment.trim()) return;
        try {
            showSavingBadge(true);
            await api.addComment(requestId, comment.trim(), generateRequestId());
            setComment('');
            await refreshDashboard();
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
                                className="border-b border-base-200 pb-2 text-sm last:border-0"
                                key={c.Id}>
                                <div className="font-medium">
                                    {c.userName}{' '}
                                    <span className="ml-2 text-xs font-normal text-base-content/50">
                                        {formatDateTime(c.Timestamp)}
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap text-base-content/70">
                                    {c.Message}
                                </p>
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
                    <dt className="shrink-0 text-xs font-semibold text-base-content/50">{label}</dt>
                    <dd className="min-w-0 break-words text-sm">{value}</dd>
                </div>
            ))}
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
            <div className="detail-layout grid gap-5">{children}</div>
        </Page>
    );
}

function WorkflowActions({
    actions,
    onAction,
    icon,
}: {
    actions: string[];
    onAction: (action: string) => void;
    icon?: (action: string) => ReactNode;
}) {
    return (
        <Space wrap>
            {actions.map((action) => (
                <Button
                    type="primary"
                    key={action}
                    icon={icon?.(action)}
                    onClick={() => onAction(action)}>
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
    const [editing, setEditing] = useState(false);
    const [pendingAction, setPendingAction] = useState<InventoryRequestAction | null>(null);
    const [pendingDeleteItemIndex, setPendingDeleteItemIndex] = useState<number | null>(null);
    const [itemIndex, setItemIndex] = useState<number | null>(null);
    const [itemOpen, setItemOpen] = useState(false);
    const [itemError, setItemError] = useState('');
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
    const persistItems = async (nextItems: InventoryItemDTO[]) => {
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
        } catch (e) {
            setItemError(e instanceof Error ? e.message : String(e));
        } finally {
            showSavingBadge(false);
        }
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
        [
            'submit',
            'approve',
            'reject',
            'issue',
            'return',
            'close',
            'cancel',
        ] as InventoryRequestAction[]
    )
        .filter((action) => canTransitionInventoryRequest(request.Status, action))
        .filter((action) => (action === 'submit' ? owner : canApprove(dashboard.me)));
    return (
        <DetailLayout
            title={request.Name || `REQ-${request.DisplayId}`}
            action={
                <WorkflowActions
                    actions={actions}
                    onAction={(action) => setPendingAction(action as InventoryRequestAction)}
                    icon={(action) => workflowActionIcon(action as InventoryRequestAction)}
                />
            }>
            <div className="detail-main min-w-0">
                <Card
                    title="Details"
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => setEditing(true)}>
                                Edit
                            </Button>
                        )
                    }>
                    <DetailFields
                        fields={[
                            ['Status', <Tag key="status">{request.Status}</Tag>],
                            ['Request name', values.Name],
                            ['Start date', values.StartDate],
                            ['End date', values.EndDate],
                            ['Department', request.departmentName || 'None'],
                            ['Lead email', values.LeadEmail],
                            ['Requested by', request.userName || 'Unknown'],
                            ['Participants', values.Participants || 'None'],
                        ]}
                    />
                </Card>
                <Card
                    title="Requested items"
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => editItem(null)}>
                                Add
                            </Button>
                        )
                    }>
                    {items.length ? (
                        <div className="overflow-x-auto">
                            <Table
                                rowKey={(item) => `${item.InventoryTypeId}-${item.Quantity}`}
                                pagination={false}
                                dataSource={items}
                                columns={[
                                    { title: 'Item', dataIndex: 'itemName', key: 'itemName' },
                                    { title: 'Quantity', dataIndex: 'Quantity', key: 'Quantity' },
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
                                                        onClick={() =>
                                                            setPendingDeleteItemIndex(index)
                                                        }
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
                </Card>
            </div>
            <div className="detail-activity">
                <Activity comments={request.comments || []} requestId={request.Id} />
            </div>
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
                        <TextField
                            name="participants"
                            label="Participants (emails, comma-separated)"
                            value={values.Participants}
                            pattern={PARTICIPANTS_EMAIL_PATTERN}
                            title={PARTICIPANTS_EMAIL_TITLE}
                            onChange={(e) => update('Participants', e.target.value)}
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
                                <Select.Option value="good">Good</Select.Option>
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
            title={ticket.Title || `TKT-${ticket.DisplayId}`}
            action={
                <WorkflowActions
                    actions={actions}
                    onAction={(action) => setPendingAction(action as TicketAction)}
                    icon={(action) => workflowActionIcon(action as TicketAction)}
                />
            }>
            <div className="detail-main min-w-0">
                <Card
                    title="Details"
                    action={
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => setEditing(true)}>
                            Edit
                        </Button>
                    }>
                    <DetailFields
                        fields={[
                            ['Status', <Tag key="status">{ticket.Status}</Tag>],
                            ['Title', values.Title],
                            ['Assigned to', ticket.assigneeName || 'Unassigned'],
                        ]}
                    />
                    <div className="mt-4 sm:col-span-2">
                        <dt className="text-xs font-semibold text-base-content/50">Description</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm">
                            {values.Description || 'No description.'}
                        </dd>
                    </div>
                </Card>
            </div>
            <div className="detail-activity">
                <Activity comments={ticket.comments || []} requestId={ticket.Id} />
            </div>
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
        <Page
            title={title}
            action={
                <Button type="link" onClick={back}>
                    Back
                </Button>
            }>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card title="Details">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-base-content/50">Status</dt>
                            <dd>
                                <Tag>{row.Status}</Tag>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-base-content/50">Requested by</dt>
                            <dd>{row.userName || row.assigneeName || '—'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs text-base-content/50">Description</dt>
                            <dd className="whitespace-pre-wrap">
                                {row.Description || 'No description.'}
                            </dd>
                        </div>
                    </dl>
                </Card>
                <Card title="Actions">
                    <div className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                            <Button
                                size="small"
                                key={action}
                                onClick={() => setPendingAction(action)}>
                                {action}
                            </Button>
                        ))}
                    </div>
                </Card>
            </div>
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
        </Page>
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
