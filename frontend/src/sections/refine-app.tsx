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
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
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
import { formatDateTime, formatRosterSchedule } from '../ui/format';
import { roleLabel } from '../ui/styles';
import { canApprove, canManageConfig } from '../workflows';

type Props = { dashboard: DashboardPayload };
const error = (e: unknown) => showErrorAlert(e);

function Page({
    title,
    subtitle,
    action,
    children,
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="antd-page">
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>{title}</Typography.Title>
                    {subtitle && (
                        <Typography.Paragraph type="secondary">{subtitle}</Typography.Paragraph>
                    )}
                </div>
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
        <AntModal open title={title} onCancel={close} footer={null} destroyOnClose>
            {children}
        </AntModal>
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
}: {
    name: string;
    label: string;
    value?: string | number;
    type?: string;
    required?: boolean;
}) {
    return (
        <AntForm.Item label={label} required={required} className="antd-form-item">
            <Input name={name} type={type} defaultValue={value ?? ''} required={required} />
        </AntForm.Item>
    );
}

function Home({ dashboard }: Props) {
    const cards = [
        ['Inventory requests', dashboard.inventoryRequests.length, 'inventory'],
        ['Program requests', dashboard.programRequests.length, 'programs'],
        ['Tickets', dashboard.tickets.length, 'tickets'],
        ['Upcoming shifts', dashboard.upcomingRosters.length, 'roster'],
    ];
    return (
        <Page title="Home" subtitle={`Welcome back, ${dashboard.me.Name}.`}>
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
        await api.updateOwnProfile({
            name: String(d.get('name')),
            departmentId: String(d.get('departmentId') || ''),
            phone: String(d.get('phone') || ''),
            whatsapp: String(d.get('whatsapp') || ''),
        });
    });
    return (
        <Page
            title={registration ? 'Welcome' : 'Profile'}
            subtitle={
                registration ? 'Complete your profile to access the app.' : 'Your contact details.'
            }>
            <Card title={registration ? 'Get started' : me.Name}>
                <form
                    id={registration ? 'registration-form' : 'profile-form'}
                    className="grid gap-3 sm:grid-cols-2"
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
                    <TextField name="phone" label="Phone" value={me.Phone} required />
                    <TextField name="whatsapp" label="WhatsApp" value={me.Whatsapp} />
                    {!registration && (
                        <div className="text-sm text-base-content/60 sm:col-span-2">
                            {me.Email} · <Tag color="blue">{roleLabel(me.Role)}</Tag>
                        </div>
                    )}
                    <div className="sm:col-span-2">
                        <Submit
                            label={registration ? 'Get started' : 'Save changes'}
                            busy={save.busy}
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
        if (user) await api.updateUser(user.Email, values);
        else
            await api.createUser(
                { email: String(d.get('email')).toLowerCase(), ...values },
                generateRequestId(),
            );
    }, close);
    return (
        <Modal title={user ? 'Edit user' : 'Add user'} close={close}>
            <form id="refine-user-form" className="grid gap-3 sm:grid-cols-2" onSubmit={save.run}>
                {!user && <TextField name="email" label="Email" type="email" required />}
                <TextField name="name" label="Name" value={user?.Name} required />
                <AntForm.Item label="Role">
                    <input type="hidden" name="role" value={role} />
                    <Select value={role} onChange={setRole} style={{ width: '100%' }}>
                        {(['admin', 'approver', 'viewer', 'user'] as UserRole[]).map((r) => (
                            <Select.Option key={r} value={r}>
                                {roleLabel(r)}
                            </Select.Option>
                        ))}
                    </Select>
                </AntForm.Item>
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
                <TextField name="phone" label="Phone" value={user?.Phone} />
                <TextField name="whatsapp" label="WhatsApp" value={user?.Whatsapp} />
                <div className="sm:col-span-2">
                    <Submit label={user ? 'Save' : 'Add'} busy={save.busy} />
                </div>
            </form>
        </Modal>
    );
}
function Users({ dashboard }: Props) {
    const [editing, setEditing] = useState<UserDTO | undefined>();
    const [creating, setCreating] = useState(false);
    const [users, setUsers] = useState<UserDTO[] | null>(null);
    useEffect(() => {
        api.listUsers().then(setUsers).catch(error);
    }, []);
    const shown = users || [];
    return (
        <Page
            title="Users"
            subtitle="People in your Google domain."
            action={
                canManageConfig(dashboard.me) && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}>
                        Add user
                    </Button>
                )
            }>
            <Card
                title={
                    users ? `${shown.length} ${shown.length === 1 ? 'person' : 'people'}` : 'Users'
                }>
                {users === null ? (
                    <Empty>Loading users…</Empty>
                ) : shown.length ? (
                    <Table
                        rowKey="Email"
                        dataSource={shown}
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
                                title: '',
                                key: 'actions',
                                align: 'right' as const,
                                render: (_: unknown, user: UserDTO) =>
                                    canManageConfig(dashboard.me) ? (
                                        <Button
                                            type="link"
                                            icon={<EditOutlined />}
                                            onClick={() => setEditing(user)}>
                                            Edit
                                        </Button>
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
                <form
                    id="refine-roster-form"
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={save.run}>
                    <TextField name="name" label="Shift" value={row?.Name} required />
                    <AntForm.Item label="Assignee">
                        <input type="hidden" name="userId" value={userId} />
                        <Select value={userId} onChange={setUserId} style={{ width: '100%' }}>
                            <Select.Option value="">Unassigned</Select.Option>
                            {dashboard.me &&
                                dashboard.departments.map((d) => (
                                    <Select.Option key={d.Id} value={d.Id}>
                                        {d.Name}
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
                    <div className="sm:col-span-2">
                        <Submit label={row ? 'Save' : 'Schedule'} busy={save.busy} />
                    </div>
                </form>
            </Modal>
        );
    };
    return (
        <Page
            title="Roster"
            subtitle="Upcoming shifts and assignments."
            action={
                canEdit && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}>
                        Schedule a shift
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
                                                onClick={async () => {
                                                    if (confirm('Delete this shift?')) {
                                                        await api.deleteRoster(
                                                            row.Id,
                                                            generateRequestId(),
                                                        );
                                                        await refreshDashboard();
                                                    }
                                                }}
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
    const [view, setView] = useState(params.get(WORKBENCH_VIEW_QUERY_PARAM) || 'all');
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
    const title = isInventory ? 'Inventory requests' : isProgram ? 'Program requests' : 'Tickets';
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
            style={{ minWidth: 180 }}
            value={view}
            onChange={(value) => {
                setView(value);
                updateQuery(WORKBENCH_VIEW_QUERY_PARAM, value);
            }}>
            <Select.Option value="all">All programs</Select.Option>
            <Select.Option value="active">Ongoing &amp; Future</Select.Option>
            <Select.Option value="past">Past</Select.Option>
        </Select>
    ) : null;
    return (
        <Page
            title={title}
            subtitle="A standardized request workspace."
            action={
                <Button type="primary" icon={<PlusOutlined />} onClick={create}>
                    New
                </Button>
            }>
            <Space className="antd-toolbar" wrap>
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
                                            <Typography.Text type="secondary">
                                                {isInventory
                                                    ? `REQ-${row.DisplayId}`
                                                    : isProgram
                                                      ? `PRG-${row.DisplayId}`
                                                      : `TKT-${row.DisplayId}`}
                                            </Typography.Text>
                                            <Typography.Text strong>
                                                {isProgram || isInventory ? row.Name : row.Title}
                                            </Typography.Text>
                                            <Typography.Text type="secondary">
                                                {isProgram || isInventory
                                                    ? row.userName
                                                    : row.assigneeName || 'Unassigned'}
                                            </Typography.Text>
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
                    type: String(d.get('type') || 'Program'),
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
                    <TextField name="name" label={kind === 'tickets' ? 'Title' : 'Name'} required />
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
                            <TextField
                                name="type"
                                label="Program type"
                                value={dashboard.programTypes[0]?.Name || 'Program'}
                                required
                            />
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
    back,
}: {
    request: ProgramRequestDTO;
    dashboard: DashboardPayload;
    back: () => void;
}) {
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const [editing, setEditing] = useState(false);
    const [sessions, setSessions] = useState<ProgramSession[]>(request.sessions);
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
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
    return (
        <Page
            title={
                [request.Language, request.Type, request.Name].filter(Boolean).join(' ') ||
                `PRG-${request.DisplayId}`
            }
            subtitle={`PRG-${request.DisplayId} · ${request.Status}`}
            action={
                <Button type="link" onClick={back}>
                    Back
                </Button>
            }>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
                            <div key={label}>
                                <dt className="text-xs font-semibold text-base-content/50">
                                    {label}
                                </dt>
                                <dd className="mt-1 text-sm">{value}</dd>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card title="Actions">
                    <div className="flex flex-wrap gap-2">
                        <Tag>{request.Status}</Tag>
                        {actions.map((action) => (
                            <Button size="small" key={action} onClick={() => perform(action)}>
                                {action}
                            </Button>
                        ))}
                    </div>
                </Card>
                <div className="xl:col-span-2">
                    <Card
                        title="Sessions"
                        action={
                            editable && (
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => editSession(null)}>
                                    Add session
                                </Button>
                            )
                        }>
                        {sessions.length ? (
                            <div className="overflow-x-auto">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>Type</th>
                                            <th>Start</th>
                                            <th>End</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sessions.map((session, index) => (
                                            <tr key={`${session.StartDateTime}-${index}`}>
                                                <td>{session.Name || 'Untitled'}</td>
                                                <td>{session.Type}</td>
                                                <td>{formatDateTime(session.StartDateTime)}</td>
                                                <td>{formatDateTime(session.EndDateTime)}</td>
                                                <td>
                                                    {editable && (
                                                        <div className="flex justify-end gap-1">
                                                            <Button
                                                                type="text"
                                                                icon={<EditOutlined />}
                                                                onClick={() =>
                                                                    editSession(index)
                                                                }></Button>
                                                            <Button
                                                                type="text"
                                                                danger
                                                                icon={<DeleteOutlined />}
                                                                onClick={() =>
                                                                    setSessions((current) =>
                                                                        current.filter(
                                                                            (_, i) => i !== index,
                                                                        ),
                                                                    )
                                                                }></Button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
            {editing && (
                <Modal title="Edit program" close={() => setEditing(false)}>
                    <form className="grid gap-3 sm:grid-cols-2" onSubmit={save.run}>
                        <TextField name="name" label="Program title" value={values.Name} />
                        <TextField name="language" label="Language" value={values.Language} />
                        <TextField name="type" label="Type" value={values.Type} />
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
                        <AntForm.Item label="Department">
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
                        {canApprove(dashboard.me) && (
                            <AntForm.Item label="Requested by">
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
                        <TextField name="leadEmail" label="Lead email" value={values.LeadEmail} />
                        <TextField
                            name="participants"
                            label="Participants (emails, comma-separated)"
                            value={values.Participants}
                        />
                        <div className="sm:col-span-2">
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
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
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
    return (
        <Page
            title={title}
            subtitle={`${kind} · ${row.Status}`}
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
                                onClick={async () => {
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
                                }}>
                                {action}
                            </Button>
                        ))}
                    </div>
                </Card>
            </div>
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
                <ProgramDetail request={request} dashboard={dashboard} back={navigateToPrograms} />,
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
