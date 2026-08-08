import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
import { icon as iconMarkup, type IconName } from '../ui/icons';
import { roleBadgeClass, roleLabel } from '../ui/styles';
import { canApprove, canManageConfig } from '../workflows';

type Props = { dashboard: DashboardPayload };
const error = (e: unknown) => showErrorAlert(e);
const icon = (name: IconName, className = 'size-5') => (
    <span
        className="inline-flex"
        dangerouslySetInnerHTML={{ __html: iconMarkup(name, className) }}
    />
);

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
        <section className="space-y-5">
            <header className="section-heading">
                <div>
                    <h1>{title}</h1>
                    {subtitle && <p>{subtitle}</p>}
                </div>
                {action}
            </header>
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
        <div className="card border border-base-300 bg-base-100">
            <div className="card-body gap-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="card-title text-base">{title}</h2>
                    {action}
                </div>
                {children}
            </div>
        </div>
    );
}
function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
    return (
        <div className="border-y border-dashed border-base-300 py-10 text-center text-sm text-base-content/50">
            {children}
        </div>
    );
}
function Submit({ label = 'Save', busy }: { label?: string; busy?: boolean }) {
    return (
        <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            {label}
        </button>
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
        <dialog open className="modal">
            <div className="modal-box w-11/12 max-w-2xl">
                <button
                    className="btn btn-ghost absolute right-3 top-3"
                    onClick={close}
                    aria-label="Close">
                    ×
                </button>
                <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">{title}</h3>
                {children}
            </div>
            <button className="modal-backdrop" onClick={close} aria-label="Close" />
        </dialog>
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
        <label className="fieldset">
            <span className="label">{label}</span>
            <input
                className="input w-full"
                name={name}
                type={type}
                defaultValue={value ?? ''}
                required={required}
            />
        </label>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(([label, count, section]) => (
                    <button
                        key={String(section)}
                        className="card border border-base-300 bg-base-100 text-left transition hover:border-primary"
                        onClick={() =>
                            document
                                .querySelector<HTMLElement>(`[data-nav-section="${section}"]`)
                                ?.click()
                        }>
                        <div className="card-body gap-1">
                            <span className="text-sm text-base-content/60">{label}</span>
                            <strong className="text-3xl font-serif font-normal">{count}</strong>
                            <span className="text-xs text-primary">Open section →</span>
                        </div>
                    </button>
                ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Recent inventory requests">
                    {dashboard.inventoryRequests.slice(0, 5).map((r) => (
                        <button
                            className="flex w-full items-center justify-between border-b border-base-200 py-2 text-left text-sm last:border-0"
                            key={r.Id}
                            onClick={() => navigateToInventoryRequest(r.Id)}>
                            <span className="font-medium">
                                REQ-{r.DisplayId} · {r.Name}
                            </span>
                            <span className="badge badge-ghost badge-sm">{r.Status}</span>
                        </button>
                    ))}
                    {!dashboard.inventoryRequests.length && <Empty />}
                </Card>
                <Card title="Upcoming roster">
                    {dashboard.upcomingRosters.slice(0, 5).map((r) => (
                        <div
                            className="flex items-center justify-between border-b border-base-200 py-2 text-sm last:border-0"
                            key={r.Id}>
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
                    <label className="fieldset">
                        <span className="label">Department</span>
                        <select
                            className="select w-full"
                            name="departmentId"
                            defaultValue={me.DepartmentId}>
                            <option value="">No department</option>
                            {dashboard.departments.map((d) => (
                                <option key={d.Id} value={d.Id}>
                                    {d.Name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <TextField name="phone" label="Phone" value={me.Phone} required />
                    <TextField name="whatsapp" label="WhatsApp" value={me.Whatsapp} />
                    {!registration && (
                        <div className="text-sm text-base-content/60 sm:col-span-2">
                            {me.Email} ·{' '}
                            <span
                                className={`badge badge-soft badge-sm ${roleBadgeClass(me.Role)}`}>
                                {roleLabel(me.Role)}
                            </span>
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
                <label className="fieldset">
                    <span className="label">Role</span>
                    <select
                        className="select w-full"
                        name="role"
                        defaultValue={user?.Role || 'user'}>
                        {(['admin', 'approver', 'viewer', 'user'] as UserRole[]).map((r) => (
                            <option key={r} value={r}>
                                {roleLabel(r)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="fieldset">
                    <span className="label">Department</span>
                    <select
                        className="select w-full"
                        name="departmentId"
                        defaultValue={user?.DepartmentId || ''}>
                        <option value="">No department</option>
                        {dashboard.departments.map((d) => (
                            <option key={d.Id} value={d.Id}>
                                {d.Name}
                            </option>
                        ))}
                    </select>
                </label>
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
                    <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                        {icon('plus', 'size-4')}Add user
                    </button>
                )
            }>
            <Card
                title={
                    users ? `${shown.length} ${shown.length === 1 ? 'person' : 'people'}` : 'Users'
                }>
                {users === null ? (
                    <Empty>Loading users…</Empty>
                ) : shown.length ? (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Role</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((u) => (
                                    <tr key={u.Email}>
                                        <td>
                                            <div className="font-medium">{u.Name}</div>
                                            <div className="text-xs text-base-content/60">
                                                {u.Email}
                                            </div>
                                        </td>
                                        <td>{u.departmentName || 'No department'}</td>
                                        <td>
                                            <span
                                                className={`badge badge-soft badge-sm ${roleBadgeClass(u.Role)}`}>
                                                {roleLabel(u.Role)}
                                            </span>
                                        </td>
                                        <td>
                                            {canManageConfig(dashboard.me) && (
                                                <button
                                                    className="btn btn-ghost btn-xs"
                                                    onClick={() => setEditing(u)}>
                                                    {icon('edit', 'size-4')}Edit
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                    <label className="fieldset">
                        <span className="label">Assignee</span>
                        <select
                            className="select w-full"
                            name="userId"
                            defaultValue={row?.UserId || ''}>
                            <option value="">Unassigned</option>
                            {dashboard.me &&
                                dashboard.departments.map((d) => (
                                    <option key={d.Id} value={d.Id}>
                                        {d.Name}
                                    </option>
                                ))}
                        </select>
                    </label>
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
                    <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                        {icon('plus', 'size-4')}Schedule a shift
                    </button>
                )
            }>
            <Card title="Upcoming shifts">
                {dashboard.upcomingRosters.length ? (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Shift</th>
                                    <th>Schedule</th>
                                    <th>Assignee</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {dashboard.upcomingRosters.map((r) => (
                                    <tr key={r.Id}>
                                        <td className="font-medium">{r.Name}</td>
                                        <td>{formatRosterSchedule(r)}</td>
                                        <td>{r.userName || 'Unassigned'}</td>
                                        <td>
                                            {canEdit && (
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        onClick={() => setEditing(r)}>
                                                        {icon('edit', 'size-4')}
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-xs text-error"
                                                        onClick={async () => {
                                                            if (confirm('Delete this shift?')) {
                                                                await api.deleteRoster(
                                                                    r.Id,
                                                                    generateRequestId(),
                                                                );
                                                                await refreshDashboard();
                                                            }
                                                        }}>
                                                        {icon('trash', 'size-4')}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
        <select
            className="select select-sm"
            value={view}
            onChange={(event) => {
                setView(event.target.value);
                updateQuery(WORKBENCH_VIEW_QUERY_PARAM, event.target.value);
            }}>
            <option value="all">All programs</option>
            <option value="active">Ongoing &amp; Future</option>
            <option value="past">Past</option>
        </select>
    ) : null;
    return (
        <Page
            title={title}
            subtitle="A standardized request workspace."
            action={
                <button className="btn btn-primary btn-sm" onClick={create}>
                    {icon('plus', 'size-4')}New
                </button>
            }>
            <div className="workbench-toolbar mb-3">
                <label className="workbench-search">
                    <span className="sr-only">Search</span>
                    {icon('search', 'size-4 text-base-content/50')}
                    <input
                        className="input input-sm w-full"
                        value={search}
                        placeholder={`Search ${title.toLowerCase()}`}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            updateQuery(WORKBENCH_SEARCH_QUERY_PARAM, event.target.value);
                        }}
                    />
                </label>
                {filter}
            </div>
            <div className="flex min-h-[28rem] gap-3 overflow-x-auto pb-3">
                {statuses.map((status) => {
                    const column = filteredRows.filter((row) => row.Status === status);
                    return (
                        <section
                            className="w-72 min-w-72 rounded-box border border-base-300 bg-base-200/40 p-2"
                            key={status}>
                            <div className="mb-2 flex items-center justify-between px-2">
                                <h2 className="text-sm font-semibold">{label(status)}</h2>
                                <span className="badge badge-ghost badge-sm">{column.length}</span>
                            </div>
                            <div className="space-y-2">
                                {column.map((row) => (
                                    <button
                                        className="card w-full border border-base-300 bg-base-100 text-left transition hover:border-primary"
                                        key={row.Id}
                                        onClick={() => open(row.Id)}>
                                        <div className="card-body gap-2 p-3">
                                            <span className="font-mono text-[0.68rem] text-base-content/50">
                                                {isInventory
                                                    ? `REQ-${row.DisplayId}`
                                                    : isProgram
                                                      ? `PRG-${row.DisplayId}`
                                                      : `TKT-${row.DisplayId}`}
                                            </span>
                                            <strong className="text-sm">
                                                {isProgram || isInventory ? row.Name : row.Title}
                                            </strong>
                                            <span className="text-xs text-base-content/60">
                                                {isProgram || isInventory
                                                    ? row.userName
                                                    : row.assigneeName || 'Unassigned'}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {!column.length && (
                                    <p className="px-2 py-8 text-center text-xs text-base-content/45">
                                        No requests
                                    </p>
                                )}
                            </div>
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
                <button className="btn btn-ghost btn-sm" onClick={back}>
                    {icon('chevronLeft', 'size-4')}Cancel
                </button>
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
                            <label className="fieldset">
                                <span className="label">Inventory type</span>
                                <select name="inventoryTypeId" className="select w-full" required>
                                    <option value="">Select equipment</option>
                                    {dashboard.inventoryTypes.map((t) => (
                                        <option key={t.Id} value={t.Id}>
                                            {t.Name}
                                        </option>
                                    ))}
                                </select>
                            </label>
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
                            <label className="fieldset">
                                <span className="label">Place</span>
                                <select name="placeId" className="select w-full">
                                    <option value="">No place</option>
                                    {dashboard.places.map((p) => (
                                        <option key={p.Id} value={p.Id}>
                                            {p.Name}
                                        </option>
                                    ))}
                                </select>
                            </label>
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
                <button className="btn btn-ghost btn-sm" onClick={back}>
                    {icon('chevronLeft', 'size-4')}Back
                </button>
            }>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Card
                    title="Program details"
                    action={
                        editable && (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setEditing(true)}>
                                {icon('edit', 'size-4')}Edit
                            </button>
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
                        <span className="badge badge-ghost">{request.Status}</span>
                        {actions.map((action) => (
                            <button
                                className="btn btn-sm"
                                key={action}
                                onClick={() => perform(action)}>
                                {action}
                            </button>
                        ))}
                    </div>
                </Card>
                <div className="xl:col-span-2">
                    <Card
                        title="Sessions"
                        action={
                            editable && (
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => editSession(null)}>
                                    {icon('plus', 'size-4')}Add session
                                </button>
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
                                                            <button
                                                                className="btn btn-ghost btn-xs"
                                                                onClick={() => editSession(index)}>
                                                                {icon('edit', 'size-4')}
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-xs text-error"
                                                                onClick={() =>
                                                                    setSessions((current) =>
                                                                        current.filter(
                                                                            (_, i) => i !== index,
                                                                        ),
                                                                    )
                                                                }>
                                                                {icon('trash', 'size-4')}
                                                            </button>
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
                                <input
                                    className="input input-sm min-w-0 flex-1"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Add a comment"
                                />
                                <button className="btn btn-sm" type="submit">
                                    Send
                                </button>
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
                        <label className="fieldset">
                            <span className="label">Place</span>
                            <select
                                className="select w-full"
                                value={values.PlaceId}
                                onChange={(e) => update('PlaceId', e.target.value)}>
                                <option value="">No place</option>
                                {dashboard.places.map((p) => (
                                    <option key={p.Id} value={p.Id}>
                                        {p.Name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="fieldset">
                            <span className="label">Department</span>
                            <select
                                className="select w-full"
                                value={values.DepartmentId}
                                onChange={(e) => update('DepartmentId', e.target.value)}>
                                {dashboard.departments.map((d) => (
                                    <option key={d.Id} value={d.Id}>
                                        {d.Name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {canApprove(dashboard.me) && (
                            <label className="fieldset">
                                <span className="label">Requested by</span>
                                <select
                                    className="select w-full"
                                    value={values.UserId}
                                    onChange={(e) => update('UserId', e.target.value)}>
                                    {users.map((u) => (
                                        <option key={u.Email} value={u.Email}>
                                            {u.Name}
                                        </option>
                                    ))}
                                </select>
                            </label>
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
            <label className="fieldset">
                <span className="label">Session type</span>
                <select
                    className="select w-full"
                    value={draft.Type}
                    onChange={(e) => update('Type', e.target.value)}
                    required>
                    <option value="">Select type</option>
                    {types.map((t) => (
                        <option key={t.Id} value={t.Name}>
                            {t.Name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="fieldset">
                <span className="label">Session title</span>
                <input
                    className="input w-full"
                    value={draft.Name}
                    onChange={(e) => update('Name', e.target.value)}
                />
            </label>
            <label className="fieldset">
                <span className="label">Start</span>
                <input
                    className="input w-full"
                    type="datetime-local"
                    value={draft.StartDateTime ? draft.StartDateTime.slice(0, 16) : ''}
                    onChange={(e) => update('StartDateTime', e.target.value)}
                    required
                />
            </label>
            <label className="fieldset">
                <span className="label">End</span>
                <input
                    className="input w-full"
                    type="datetime-local"
                    value={draft.EndDateTime ? draft.EndDateTime.slice(0, 16) : ''}
                    onChange={(e) => update('EndDateTime', e.target.value)}
                    required
                />
            </label>
            <div className="modal-action sm:col-span-2">
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
                    <button className="btn" onClick={back}>
                        Back
                    </button>
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
                <button className="btn btn-ghost btn-sm" onClick={back}>
                    {icon('chevronLeft', 'size-4')}Back
                </button>
            }>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card title="Details">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-base-content/50">Status</dt>
                            <dd>
                                <span className="badge badge-ghost">{row.Status}</span>
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
                            <button
                                className="btn btn-sm"
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
                            </button>
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
