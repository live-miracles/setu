import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
    WhatsAppOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import {
    navigateToInventoryCreate,
    navigateToInventoryRequest,
    navigateToInventoryRequests,
    navigateToProgram,
    navigateToProgramCreate,
    navigateToPrograms,
    navigateToTicket,
    navigateToTicketCreate,
    navigateToTickets,
    refreshDashboard,
    replaceWorkbenchUrl,
} from '../router';
import { WORKBENCH_SEARCH_QUERY_PARAM, WORKBENCH_VIEW_QUERY_PARAM } from '../config';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTime, formatProgramDateRange, formatRosterSchedule } from '../ui/format';
import { roleLabel } from '../ui/styles';
import { canApprove, canManageConfig } from '../workflows';

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

function programActionIcon(action: ProgramRequestAction): ReactNode {
    if (action === 'submit') return <SendOutlined />;
    if (action === 'approve') return <CheckOutlined />;
    if (action === 'reject') return <CloseOutlined />;
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
function useSave(action: () => Promise<unknown>, close?: () => void) {
    const [busy, setBusy] = useState(false);
    return {
        busy,
        run: async (event?: FormEvent) => {
            event?.preventDefault();
            setBusy(true);
            try {
                await action();
                close?.();
                await refreshDashboard();
            } catch (e) {
                error(e);
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
}: {
    name: string;
    label: string;
    value?: string | number;
    type?: string;
    required?: boolean;
    pattern?: string;
    title?: string;
}) {
    return (
        <AntForm.Item label={label} required={required} className="antd-form-item">
            <Input
                name={name}
                type={type}
                defaultValue={value ?? ''}
                required={required}
                pattern={pattern}
                title={title}
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
                        <Submit label={registration ? 'Get started' : 'Save'} busy={save.busy} />
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
            <form id="refine-user-form" className="grid gap-3" onSubmit={save.run}>
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
                    <Submit label={user ? 'Save' : 'Add'} busy={save.busy} />
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
    useEffect(() => {
        if (canEdit) api.listUsers().then(setUsers).catch(error);
    }, [canEdit]);
    const Form = ({ row }: { row?: RosterDTO }) => {
        const [userId, setUserId] = useState(row?.UserId || '');
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
                <form id="refine-roster-form" className="grid gap-3" onSubmit={save.run}>
                    <TextField name="name" label="Shift" value={row?.Name} required />
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
                    <TextField
                        name="startTime"
                        label="Start time"
                        type="time"
                        value={row?.StartTime}
                    />
                    <TextField name="endTime" label="End time" type="time" value={row?.EndTime} />
                    <div>
                        <Submit label={row ? 'Save' : 'Schedule'} busy={save.busy} />
                    </div>
                </form>
            </Modal>
        );
    };
    return (
        <Page
            title="Roster"
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
            <Card title="Upcoming shifts">
                {dashboard.upcomingRosters.length ? (
                    <Table
                        rowKey="Id"
                        dataSource={dashboard.upcomingRosters}
                        pagination={false}
                        columns={[
                            {
                                title: 'Shift',
                                dataIndex: 'Name',
                                render: (value: string) => (
                                    <Typography.Text strong>{value}</Typography.Text>
                                ),
                            },
                            {
                                title: 'Schedule',
                                render: (_: unknown, row: RosterDTO) => formatRosterSchedule(row),
                            },
                            {
                                title: 'Assignee',
                                dataIndex: 'userName',
                                render: (value: string) => value || 'Unassigned',
                            },
                            {
                                title: '',
                                key: 'actions',
                                align: 'right' as const,
                                render: (_: unknown, row: RosterDTO) =>
                                    canEdit ? (
                                        <Space>
                                            <Button
                                                type="text"
                                                icon={<EditOutlined />}
                                                onClick={() => setEditing(row)}
                                            />
                                            <Button
                                                type="text"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => setDeleting(row)}
                                            />
                                        </Space>
                                    ) : null,
                            },
                        ]}
                    />
                ) : (
                    <Empty>No shifts scheduled.</Empty>
                )}
            </Card>
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
    const create = isInventory
        ? navigateToInventoryCreate
        : isProgram
          ? navigateToProgramCreate
          : navigateToTicketCreate;
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
                <Button type="primary" icon={<PlusOutlined />} onClick={create}>
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
        </Page>
    );
}

function RequestTable({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    return <RequestBoard kind={kind} dashboard={dashboard} />;
}

function CreateRecord({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' | 'tickets' }) {
    const [inventoryTypeId, setInventoryTypeId] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [programType, setProgramType] = useState(
        dashboard.programTypes[0]?.Name || OTHER_PROGRAM_TYPE,
    );
    const back =
        kind === 'inventory'
            ? navigateToInventoryRequests
            : kind === 'programs'
              ? navigateToPrograms
              : navigateToTickets;
    const save = useSave(async () => {
        const d = new FormData(document.getElementById('refine-request-form') as HTMLFormElement);
        const name = String(d.get('name') || '');
        if (kind === 'tickets')
            await api.createTicket(
                { title: name, description: String(d.get('description') || '') },
                generateRequestId(),
            );
        else if (kind === 'inventory')
            await api.createInventoryRequest(
                {
                    name,
                    userId: dashboard.me.Email,
                    startDate: String(d.get('startDate')),
                    endDate: String(d.get('endDate')),
                    items: [
                        {
                            inventoryTypeId: String(d.get('inventoryTypeId')),
                            quantity: Number(d.get('quantity') || 1),
                        },
                    ],
                    imageId: '',
                    departmentId: dashboard.me.DepartmentId,
                    leadEmail: dashboard.me.Email,
                    participants: '',
                },
                generateRequestId(),
            );
        else
            await api.createProgramRequest(
                {
                    name,
                    language: String(d.get('language') || 'English'),
                    type: programType,
                    userId: dashboard.me.Email,
                    placeId: String(d.get('placeId') || ''),
                    sessions: [],
                    departmentId: dashboard.me.DepartmentId,
                    leadEmail: dashboard.me.Email,
                    participants: '',
                },
                generateRequestId(),
            );
    });
    return (
        <Page
            title={`New ${kind === 'tickets' ? 'ticket' : kind === 'programs' ? 'program request' : 'inventory request'}`}
            action={
                <Button type="link" onClick={back}>
                    Cancel
                </Button>
            }>
            <Card title="Request details">
                <form
                    id="refine-request-form"
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={async (e) => {
                        await save.run(e);
                        back();
                    }}>
                    <TextField
                        name="name"
                        label={kind === 'tickets' ? 'Title' : 'Name'}
                        required={kind !== 'programs' || programType === OTHER_PROGRAM_TYPE}
                    />
                    <TextField name="description" label="Description" />
                    {kind === 'inventory' && (
                        <>
                            <TextField name="startDate" label="Start date" type="date" required />
                            <TextField name="endDate" label="End date" type="date" required />
                            <AntForm.Item label="Inventory type" required>
                                <input
                                    type="hidden"
                                    name="inventoryTypeId"
                                    value={inventoryTypeId}
                                />
                                <Select
                                    value={inventoryTypeId}
                                    onChange={setInventoryTypeId}
                                    style={{ width: '100%' }}>
                                    <Select.Option value="">Select equipment</Select.Option>
                                    {dashboard.inventoryTypes.map((t) => (
                                        <Select.Option key={t.Id} value={t.Id}>
                                            {t.Name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </AntForm.Item>
                            <TextField
                                name="quantity"
                                label="Quantity"
                                type="number"
                                value={1}
                                required
                            />
                        </>
                    )}
                    {kind === 'programs' && (
                        <>
                            <TextField
                                name="language"
                                label="Language"
                                value={dashboard.programLanguages[0]?.Name || 'English'}
                                required
                            />
                            <AntForm.Item label="Program type" required>
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
                            <AntForm.Item label="Place">
                                <input type="hidden" name="placeId" value={placeId} />
                                <Select
                                    value={placeId}
                                    onChange={setPlaceId}
                                    style={{ width: '100%' }}>
                                    <Select.Option value="">No place</Select.Option>
                                    {dashboard.places.map((p) => (
                                        <Select.Option key={p.Id} value={p.Id}>
                                            {p.Name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </AntForm.Item>
                        </>
                    )}
                    <div className="sm:col-span-2">
                        <Submit label="Save draft" busy={save.busy} />
                    </div>
                </form>
            </Card>
        </Page>
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
    const [pendingAction, setPendingAction] = useState<ProgramRequestAction | null>(null);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>({
        Name: '',
        Type: dashboard.sessionTypes[0]?.Name || '',
        StartDateTime: '',
        EndDateTime: '',
    });
    const [comment, setComment] = useState('');
    const [users, setUsers] = useState<UserDTO[]>([]);
    useEffect(() => {
        if (canApprove(dashboard.me)) api.listUsers().then(setUsers).catch(error);
    }, [dashboard.me]);
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
        setSessionDraft(
            index === null
                ? {
                      Name: '',
                      Type: dashboard.sessionTypes[0]?.Name || '',
                      StartDateTime: '',
                      EndDateTime: '',
                  }
                : { ...sessions[index] },
        );
        setSessionOpen(true);
    };
    const saveSession = (event: FormEvent) => {
        event.preventDefault();
        if (
            !sessionDraft.Type ||
            !sessionDraft.StartDateTime ||
            !sessionDraft.EndDateTime ||
            new Date(sessionDraft.EndDateTime) <= new Date(sessionDraft.StartDateTime)
        )
            return;
        setSessions((current) =>
            sessionIndex === null
                ? [...current, sessionDraft]
                : current.map((s, i) => (i === sessionIndex ? sessionDraft : s)),
        );
        setSessionIndex(null);
        setSessionOpen(false);
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
    const submitComment = async (event: FormEvent) => {
        event.preventDefault();
        if (!comment.trim()) return;
        try {
            showSavingBadge(true);
            await api.addComment(request.Id, comment.trim(), generateRequestId());
            setComment('');
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
            title: 'Title',
            dataIndex: 'Name',
            key: 'Name',
            render: (value: string) => value || 'Untitled',
        },
        { title: 'Type', dataIndex: 'Type', key: 'Type' },
        {
            title: 'Start',
            dataIndex: 'StartDateTime',
            key: 'StartDateTime',
            render: (value: string) => formatDateTime(value),
        },
        {
            title: 'End',
            dataIndex: 'EndDateTime',
            key: 'EndDateTime',
            render: (value: string) => formatDateTime(value),
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
        <Page
            title={
                formatProgramName(request.Language, request.Type, request.Name) ||
                `PRG-${request.DisplayId}`
            }
            action={
                <Space className="program-detail-actions" wrap>
                    {actions.map((action) => (
                        <Button
                            type="primary"
                            key={action}
                            icon={programActionIcon(action)}
                            onClick={() => setPendingAction(action)}>
                            {action}
                        </Button>
                    ))}
                </Space>
            }>
            <div className="grid gap-5 xl:grid-cols-2">
                <div className="min-w-0">
                    <Card
                        title="Program details"
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
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex min-w-0 items-baseline gap-2">
                                <dt className="shrink-0 text-xs font-semibold text-base-content/50">
                                    Status
                                </dt>
                                <dd className="min-w-0">
                                    <Tag>{request.Status}</Tag>
                                </dd>
                            </div>
                            {(
                                [
                                    ['Program title', values.Name],
                                    ['Language', values.Language],
                                    ['Type', values.Type],
                                    ['Place', request.placeName || 'None'],
                                    ['Department', request.departmentName || 'None'],
                                    ['Lead email', values.LeadEmail],
                                    ['Requested by', request.userName],
                                    ['Participants', values.Participants || 'None'],
                                ] as const
                            ).map(([label, value]) => (
                                <div key={label} className="flex min-w-0 items-baseline gap-2">
                                    <dt className="shrink-0 text-xs font-semibold text-base-content/50">
                                        {label}
                                    </dt>
                                    <dd className="min-w-0 break-words text-sm">{value}</dd>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
                <div className="min-w-0 overflow-hidden">
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
                                    scroll={{ x: 640 }}
                                />
                            </div>
                        ) : (
                            <Empty>No sessions added.</Empty>
                        )}
                    </Card>
                </div>
                <div className="xl:col-span-2">
                    <Card title="Activity">
                        <div className="space-y-3">
                            {request.comments?.length ? (
                                request.comments.map((c) => (
                                    <div
                                        className="border-b border-base-200 pb-2 text-sm last:border-0"
                                        key={c.Id}>
                                        <div className="font-medium">
                                            {c.userName}{' '}
                                            <span className="ml-2 text-xs font-normal text-base-content/50">
                                                {formatDateTime(c.Timestamp)}
                                            </span>
                                        </div>
                                        <p className="text-base-content/70">{c.Message}</p>
                                    </div>
                                ))
                            ) : (
                                <Empty>No activity yet.</Empty>
                            )}
                            <form className="flex gap-2" onSubmit={submitComment}>
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
                        </div>
                    </Card>
                </div>
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
                        setSessions((current) =>
                            current.filter((_, i) => i !== pendingDeleteSessionIndex),
                        );
                        setPendingDeleteSessionIndex(null);
                    }}
                />
            )}
            {editing && (
                <Modal title="Edit program" close={() => setEditing(false)}>
                    <form className="grid gap-3" onSubmit={save.run}>
                        <TextField
                            name="name"
                            label="Program title"
                            value={values.Name}
                            required={values.Type === OTHER_PROGRAM_TYPE}
                        />
                        <TextField
                            name="language"
                            label="Language"
                            value={values.Language}
                            required
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
                            value={values.LeadEmail}
                            required
                        />
                        <TextField
                            name="participants"
                            label="Participants (emails, comma-separated)"
                            value={values.Participants}
                        />
                        <div>
                            <Submit label="Save changes" busy={save.busy} />
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
                        onSubmit={saveSession}
                    />
                </Modal>
            )}
        </Page>
    );
}

function SessionForm({
    draft,
    setDraft,
    types,
    onSubmit,
}: {
    draft: ProgramSession;
    setDraft: (value: ProgramSession) => void;
    types: SessionType[];
    onSubmit: (event: FormEvent) => void;
}) {
    const update = (key: keyof ProgramSession, value: string) =>
        setDraft({ ...draft, [key]: value });
    return (
        <form className="grid gap-3" onSubmit={onSubmit}>
            <AntForm.Item label="Session type" required>
                <Select
                    value={draft.Type}
                    onChange={(value) => update('Type', value)}
                    style={{ width: '100%' }}>
                    <Select.Option value="">Select type</Select.Option>
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
                    type="datetime-local"
                    value={draft.StartDateTime ? draft.StartDateTime.slice(0, 16) : ''}
                    onChange={(e) => update('StartDateTime', e.target.value)}
                    required
                />
            </AntForm.Item>
            <AntForm.Item label="End" required>
                <Input
                    type="datetime-local"
                    value={draft.EndDateTime ? draft.EndDateTime.slice(0, 16) : ''}
                    onChange={(e) => update('EndDateTime', e.target.value)}
                    required
                />
            </AntForm.Item>
            <div>
                <Submit label="Save session" />
            </div>
        </form>
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
    const title = kind === 'tickets' ? row.Title : row.Name;
    const actions =
        kind === 'tickets'
            ? ['assign', 'close', 'reopen']
            : kind === 'programs'
              ? ['submit', 'approve', 'reject', 'cancel']
              : ['submit', 'approve', 'reject', 'issue', 'return', 'close', 'cancel'];
    const applyAction = async (action: string) => {
        try {
            showSavingBadge(true);
            if (kind === 'tickets')
                await api.performTicketAction(
                    row.Id,
                    action as TicketAction,
                    null,
                    generateRequestId(),
                );
            else if (kind === 'programs')
                await api.performProgramRequestAction(
                    row.Id,
                    action as ProgramRequestAction,
                    '',
                    generateRequestId(),
                );
            else
                await api.performInventoryRequestAction(
                    row.Id,
                    action as InventoryRequestAction,
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
