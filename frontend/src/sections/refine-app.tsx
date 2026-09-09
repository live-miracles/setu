import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';
import {
    useCreate,
    useCustomMutation,
    useDelete,
    useInvalidate,
    useList,
    useOne,
    useUpdate,
} from '@refinedev/core';
import {
    Button,
    Card as AntCard,
    Empty as AntEmpty,
    Form as AntForm,
    Input,
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
    PlusOutlined,
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
    navigateToUser,
    refreshDashboard,
    replaceWorkbenchUrl,
    inventoryRequestUrl,
    programRequestUrl,
    userUrl,
} from '../router';
import {
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
    USER_QUERY_PARAM,
} from '../config';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { AppLoading, setAppLoading } from '../ui/app-loading';
import { formatDateTime, formatProgramSessionSchedule } from '../ui/format';
import { formatDateTimeLocal, formatLocalDateOnly } from '../ui/date';
import {
    buildRosterTableModel,
    formatRosterTableTimes,
    getShiftTypeTimes,
} from '../ui/roster-table';
import { matchesSearch } from '../ui/search';
import { roleLabel } from '../ui/styles';
import { createRecordDestination } from '../ui/create-record';
import { addScannedInventoryItem, findInventoryTypeByQrValue } from '../ui/inventory-qr';
import { prepareInventoryImage } from '../ui/inventory-image';
import { supabase } from '../supabase';
import { RequestImage } from '../ui/request-image';
import { QrScanner } from '../ui/qr-scanner';
import { ImageCamera } from '../ui/image-camera';
import { RequestBlock } from '../ui/request-block';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { TableView } from '../ui/table-view';
import { UserBlock } from '../ui/user-block';
import {
    buildDuplicateProgramInput,
    canRescheduleProgram,
    getLocalDateFromSession,
    getProgramRequestActions,
    shiftProgramSessions,
} from '../ui/program-actions';
import { canApprove, canManageConfig, canTransitionInventoryRequest } from '../workflows';
import {
    ActionConfirmation,
    Card,
    Empty,
    Modal,
    Page,
    SaveFooter,
    Submit,
    TextField,
    useSave,
} from './refine-shared';
import { Home } from './home';
import { Calendar } from './calendar';

type Props = { dashboard: DashboardPayload };
const OTHER_PROGRAM_TYPE = 'Other';
const PROGRAM_REQUEST_STATUSES: ProgramRequestStatus[] = [
    'draft',
    'submitted',
    'approved',
    'rejected',
    'cancelled',
];
const requesterOptionLabel = (user: UserDTO): string => `${user.Name} <${user.Email}>`;
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

const INTERNATIONAL_PHONE_PATTERN = '\\+[1-9][0-9]{7,14}';
const INTERNATIONAL_PHONE_TITLE =
    'Enter a valid phone number with country code using digits only, for example +919000000000.';
function isValidInternationalPhone(phone: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(phone);
}

function Profile({ dashboard, registration = false }: Props & { registration?: boolean }) {
    const me = dashboard.me;
    const [departmentId, setDepartmentId] = useState(me.DepartmentId);
    const save = useSave(
        async () => {
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
            const profile = {
                name: String(d.get('name')),
                departmentId: departmentIdValue,
                phone,
                whatsapp,
            };
            await api.updateOwnProfile(profile);
        },
        undefined,
        false,
    );
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

// Edit-only: users self-register on first sign-in (see the
// on_auth_user_created trigger) rather than being pre-provisioned by an
// admin, so there is no "Add user" flow.
function UserForm({
    dashboard,
    user,
    close,
}: {
    dashboard: DashboardPayload;
    user: UserDTO;
    close: () => void;
}) {
    const [role, setRole] = useState<UserRole>(user.Role);
    const [departmentId, setDepartmentId] = useState(user.DepartmentId);
    const { mutateAsync: updateUser } = useUpdate();
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
        await updateUser({
            resource: 'users',
            id: user.Email,
            values,
            successNotification: false,
            errorNotification: false,
        });
    }, close);
    return (
        <Modal title="Edit user" close={close}>
            <form id="refine-user-form" className="grid gap-3" noValidate onSubmit={save.run}>
                <TextField name="name" label="Name" value={user.Name} required />
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
                    value={user.Phone}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <TextField
                    name="whatsapp"
                    label="WhatsApp"
                    type="tel"
                    value={user.Whatsapp}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <div>
                    <SaveFooter label="Save" busy={save.busy} errorMessage={save.errorMessage} />
                </div>
            </form>
        </Modal>
    );
}
function Users({ dashboard }: Props) {
    const [editing, setEditing] = useState<UserDTO | undefined>();
    const [deleting, setDeleting] = useState<UserDTO | null>(null);
    const { mutateAsync: deleteUser } = useDelete();
    const { result } = useList({ resource: 'users', pagination: { mode: 'off' } });
    const users = result.data as UserDTO[];
    const selectedUserId = new URLSearchParams(window.location.search).get(USER_QUERY_PARAM);
    const selectedUser = selectedUserId
        ? users.find((user) => user.Email === selectedUserId) || null
        : null;
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const shown = users;
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
        </div>
    );
    const userDetail = selectedUser && (
        <DetailLayout
            title={selectedUser.Name}
            action={
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
            }>
            <DetailSection
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
            </DetailSection>
            <DetailSection span="full">
                <RelatedRequestBlocks
                    title="Programs"
                    kind="program"
                    items={userPrograms}
                    dashboard={dashboard}
                    emptyMessage="No program requests from this user."
                    hrefFor={programRequestUrl}
                    onOpen={navigateToProgram}
                />
            </DetailSection>
            <DetailSection span="full">
                <RelatedRequestBlocks
                    title="Inventory requests"
                    kind="inventory"
                    items={userInventoryRequests}
                    dashboard={dashboard}
                    emptyMessage="No inventory requests from this user."
                    hrefFor={inventoryRequestUrl}
                    onOpen={navigateToInventoryRequest}
                />
            </DetailSection>
        </DetailLayout>
    );
    return (
        <>
            {selectedUser ? (
                userDetail
            ) : (
                <Page title="Users" hideHeading className="users-list-page">
                    {userHeader}
                    {filteredUsers.length ? (
                        <div className="user-card-list">
                            {filteredUsers.map((user) => (
                                <UserBlock
                                    key={user.Email}
                                    user={user}
                                    dashboard={dashboard}
                                    href={userUrl(user.Email)}
                                    onClick={() => navigateToUser(user.Email)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty>No users yet.</Empty>
                    )}
                </Page>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Are you sure you want to delete ${deleting.Name}?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await deleteUser({
                            resource: 'users',
                            id: deleting.Email,
                            successNotification: false,
                            errorNotification: false,
                        });
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {editing && (
                <UserForm
                    dashboard={dashboard}
                    user={editing}
                    close={() => setEditing(undefined)}
                />
            )}
        </>
    );
}

function Roster({ dashboard }: Props) {
    const canEdit = canApprove(dashboard.me);
    const [editing, setEditing] = useState<RosterDTO>();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<RosterDTO | null>(null);
    const { mutateAsync: deleteRoster } = useDelete();
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canEdit },
    });
    const users = usersResult.data;
    const rosterStartDate = new Date();
    rosterStartDate.setDate(rosterStartDate.getDate() - 2);
    const rosterStartIso = formatLocalDateOnly(rosterStartDate);
    const todayIso = formatLocalDateOnly(new Date());
    // Reads dashboard.upcomingRosters rather than useList({resource: 'rosters'})
    // on purpose: the grid needs every upcoming shift, unpaginated, while the
    // 'rosters' resource (api.listRosters) is a paginated, full-history list
    // built for a future admin roster listing — a different shape, not just
    // a different fetch mechanism. Only the mutations below go through it.
    const rosterTable = buildRosterTableModel(
        dashboard.upcomingRosters,
        dashboard.shiftTypes,
        rosterStartIso,
    );
    const Form = ({ row }: { row?: RosterDTO }) => {
        const [userId, setUserId] = useState(row?.UserId || '');
        const initialShiftType = dashboard.shiftTypes.find(
            (shiftType) => shiftType.Name === row?.Name,
        );
        const [shiftTypeName, setShiftTypeName] = useState(initialShiftType?.Name || '');
        const [startTime, setStartTime] = useState(
            row?.StartTime || initialShiftType?.DefaultStartTime || '',
        );
        const [endTime, setEndTime] = useState(
            row?.EndTime || initialShiftType?.DefaultEndTime || '',
        );
        const selectShiftType = (nextShiftTypeName: string) => {
            setShiftTypeName(nextShiftTypeName);
            const times = getShiftTypeTimes(dashboard.shiftTypes, nextShiftTypeName);
            if (!times) return;
            setStartTime(times.startTime);
            setEndTime(times.endTime);
        };
        const { mutateAsync: createRoster } = useCreate();
        const { mutateAsync: updateRoster } = useUpdate();
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
                const mutateOptions = {
                    successNotification: false,
                    errorNotification: false,
                } as const;
                if (row) {
                    await updateRoster({
                        resource: 'rosters',
                        id: row.Id,
                        values: v,
                        ...mutateOptions,
                    });
                } else {
                    await createRoster({ resource: 'rosters', values: v, ...mutateOptions });
                }
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
                        <input type="hidden" name="name" value={shiftTypeName} required />
                        <Select
                            value={shiftTypeName}
                            onChange={selectShiftType}
                            style={{ width: '100%' }}>
                            <Select.Option value="" disabled>
                                Select a shift
                            </Select.Option>
                            {dashboard.shiftTypes.map((shiftType) => (
                                <Select.Option key={shiftType.Name} value={shiftType.Name}>
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
                        await deleteRoster({
                            resource: 'rosters',
                            id: deleting.Id,
                            successNotification: false,
                            errorNotification: false,
                        });
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {(creating || editing) && <Form row={editing} />}
        </Page>
    );
}

function RequestBoard({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
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
        : ['draft', 'submitted', 'approved', 'rejected', 'cancelled'];
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
        const value = params.get(WORKBENCH_STATUS_QUERY_PARAM);
        return value ? value.split(',').filter((status) => statuses.includes(status)) : statuses;
    });
    const [page, setPage] = useState(1);
    const [creating, setCreating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const pageSize = 25;
    const resource = isInventory ? 'inventory-requests' : 'program-requests';
    const dateScope = view === 'past' ? 'past' : view === 'active' ? 'ongoing-future' : '';
    const { result, query } = useList<InventoryRequestDTO | ProgramRequestDTO>({
        resource,
        pagination: { currentPage: page, pageSize },
        filters: [
            { field: 'q', operator: 'eq', value: appliedSearch },
            {
                field: 'statuses',
                operator: 'eq',
                // An empty checkbox selection is different from an omitted filter;
                // the backend's explicit sentinel keeps it from meaning "all".
                value: selectedStatuses.length ? selectedStatuses : ['__none__'],
            },
            ...(isProgram
                ? [{ field: 'dateScope', operator: 'eq' as const, value: dateScope }]
                : []),
        ],
        sorters: [{ field: isProgram ? 'sessionStart' : 'startDate', order: 'asc' }],
    });
    const rows = result.data;
    const loading = query.isLoading;
    const open = (id: string) =>
        isInventory ? navigateToInventoryRequest(id) : navigateToProgram(id);
    const hrefFor = (id: string) => (isInventory ? inventoryRequestUrl(id) : programRequestUrl(id));
    const title = isInventory ? 'Inventory' : 'Programs';
    const label = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);
    const updateQuery = (key: string, value: string) => {
        const url = new URL(window.location.href);
        if (value && value !== 'all') url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        replaceWorkbenchUrl(url);
    };

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
    if (submitting) return <AppLoading />;
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
                {/* Rows stay put while a refresh is in flight: the dashboard is
                    refreshed after every mutation, and blanking the board on each
                    one flashed an empty list between the two renders. */}
                {rows.map((row) =>
                    isProgram ? (
                        <RequestBlock
                            key={row.Id}
                            kind="program"
                            row={row as ProgramRequestDTO}
                            dashboard={dashboard}
                            href={hrefFor(row.Id)}
                            onClick={() => open(row.Id)}
                        />
                    ) : (
                        <RequestBlock
                            key={row.Id}
                            kind="inventory"
                            row={row as InventoryRequestDTO}
                            dashboard={dashboard}
                            href={hrefFor(row.Id)}
                            onClick={() => open(row.Id)}
                        />
                    ),
                )}
                {!loading && !rows.length && <AntEmpty description="No requests" />}
                {(result.total ?? 0) > pageSize && (
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={result.total ?? 0}
                        showSizeChanger={false}
                        onChange={setPage}
                    />
                )}
            </div>
            {creating && (
                <Modal
                    title={`New ${isInventory ? 'inventory request' : 'program request'}`}
                    close={() => setCreating(false)}>
                    <CreateRecord
                        kind={kind}
                        dashboard={dashboard}
                        onClose={() => setCreating(false)}
                        onSubmitStart={() => {
                            setCreating(false);
                            setSubmitting(true);
                        }}
                        onSubmitEnd={() => setSubmitting(false)}
                    />
                </Modal>
            )}
        </Page>
    );
}

function RequestTable({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
    return <RequestBoard kind={kind} dashboard={dashboard} />;
}

function CreateRecord({
    kind,
    dashboard,
    onClose,
    onSubmitStart,
    onSubmitEnd,
}: Props & {
    kind: 'inventory' | 'programs';
    onClose: () => void;
    onSubmitStart?: () => void;
    onSubmitEnd?: () => void;
}) {
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canApprove(dashboard.me) },
    });
    const users = usersResult.data;
    const [language, setLanguage] = useState('');
    const [languageError, setLanguageError] = useState(false);
    const [requestedBy, setRequestedBy] = useState(dashboard.me.Email);
    const [departmentId, setDepartmentId] = useState(dashboard.me.DepartmentId);
    const initialLeadEmail =
        dashboard.departments.find((department) => department.Id === dashboard.me.DepartmentId)
            ?.LeadEmail || '';
    const [leadEmail, setLeadEmail] = useState(initialLeadEmail);
    const [programType, setProgramType] = useState(OTHER_PROGRAM_TYPE);
    const formData = useRef<FormData | null>(null);
    const [sessionDrafts, setSessionDrafts] = useState<ProgramSession[]>(() => [
        defaultSessionDraft([]),
    ]);
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
    const { mutateAsync: createRecord } = useCreate();
    const save = useSave(
        async (): Promise<{ Id: string }> => {
            const d =
                formData.current ||
                new FormData(document.getElementById('refine-request-form') as HTMLFormElement);
            const name = String(d.get('name') || '');
            const mutateOptions = { successNotification: false, errorNotification: false } as const;
            if (kind === 'inventory') {
                const created = await createRecord({
                    resource: 'inventory-requests',
                    values: {
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
                    ...mutateOptions,
                });
                return created.data as unknown as { Id: string };
            }
            const invalidSession = sessionDrafts.find(
                (session) =>
                    !session.Type ||
                    !session.StartDateTime ||
                    !session.EndDateTime ||
                    new Date(session.EndDateTime) <= new Date(session.StartDateTime),
            );
            if (invalidSession) {
                throw new Error(
                    !invalidSession.Type
                        ? 'Session type is required.'
                        : 'Session end must be after its start.',
                );
            }
            const created = await createRecord({
                resource: 'program-requests',
                values: {
                    name,
                    language: String(d.get('language') || ''),
                    type: programType,
                    userId: requestedBy,
                    placeId: '',
                    sessions: sessionDrafts.map((session) => ({
                        name: session.Name,
                        type: session.Type,
                        startDateTime: session.StartDateTime,
                        endDateTime: session.EndDateTime,
                    })),
                    departmentId,
                    leadEmail: String(d.get('leadEmail') || ''),
                    participants: '',
                },
                ...mutateOptions,
            });
            return created.data as unknown as { Id: string };
        },
        undefined,
        false,
        false,
    );
    return (
        <form
            id="refine-request-form"
            className="grid gap-3"
            noValidate
            onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }
                if (kind === 'programs' && !language) {
                    setLanguageError(true);
                    return;
                }
                formData.current = new FormData(form);
                try {
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                    const created = await save.run();
                    if (!created) return;
                    if (onSubmitStart) onSubmitStart();
                    else {
                        setAppLoading(true);
                        onClose();
                    }
                    await refreshDashboard();
                    const id = createRecordDestination(kind, created.Id);
                    if (kind === 'programs') navigateToProgram(id);
                    else navigateToInventoryRequest(id);
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                } finally {
                    if (onSubmitEnd) onSubmitEnd();
                    else setAppLoading(false);
                }
            }}>
            {kind !== 'programs' && <TextField name="name" label="Event / Purpose" required />}
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
                                        {requesterOptionLabel(user)}
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
                            onChange={(value) => {
                                setLanguage(value);
                                setLanguageError(false);
                            }}
                            style={{ width: '100%' }}
                            placeholder="Select language">
                            {dashboard.programLanguages.map((language) => (
                                <Select.Option key={language.Name} value={language.Name}>
                                    {language.Name}
                                </Select.Option>
                            ))}
                        </Select>
                        {languageError && (
                            <Typography.Text type="danger">Language is required.</Typography.Text>
                        )}
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
                    {canApprove(dashboard.me) && (
                        <AntForm.Item label="Requested by" required>
                            <input type="hidden" name="userId" value={requestedBy} required />
                            <Select
                                value={requestedBy}
                                onChange={selectRequester}
                                style={{ width: '100%' }}>
                                {users.map((user) => (
                                    <Select.Option key={user.Email} value={user.Email}>
                                        {requesterOptionLabel(user)}
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
                    {sessionDrafts.map((sessionDraft, index) => (
                        <AntCard
                            key={index}
                            size="small"
                            title={`Session ${index + 1}`}
                            extra={
                                sessionDrafts.length > 1 ? (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        aria-label={`Remove session ${index + 1}`}
                                        onClick={() =>
                                            setSessionDrafts((current) =>
                                                current.filter(
                                                    (_, currentIndex) => currentIndex !== index,
                                                ),
                                            )
                                        }
                                    />
                                ) : null
                            }>
                            <div className="grid gap-3">
                                <AntForm.Item label="Session type" required>
                                    <Select
                                        value={sessionDraft.Type || undefined}
                                        onChange={(value) =>
                                            setSessionDrafts((current) =>
                                                current.map((item, currentIndex) =>
                                                    currentIndex === index
                                                        ? { ...item, Type: value }
                                                        : item,
                                                ),
                                            )
                                        }
                                        style={{ width: '100%' }}
                                        placeholder="Select type">
                                        {dashboard.sessionTypes.map((type) => (
                                            <Select.Option key={type.Name} value={type.Name}>
                                                {type.Name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </AntForm.Item>
                                <AntForm.Item label="Start" required>
                                    <Input
                                        type="datetime-local"
                                        value={sessionDraft.StartDateTime.slice(0, 16)}
                                        onChange={(event) =>
                                            setSessionDrafts((current) =>
                                                current.map((item, currentIndex) =>
                                                    currentIndex === index
                                                        ? {
                                                              ...item,
                                                              StartDateTime: event.target.value,
                                                          }
                                                        : item,
                                                ),
                                            )
                                        }
                                        required
                                    />
                                </AntForm.Item>
                                <AntForm.Item label="End" required>
                                    <Input
                                        type="datetime-local"
                                        value={sessionDraft.EndDateTime.slice(0, 16)}
                                        onChange={(event) =>
                                            setSessionDrafts((current) =>
                                                current.map((item, currentIndex) =>
                                                    currentIndex === index
                                                        ? {
                                                              ...item,
                                                              EndDateTime: event.target.value,
                                                          }
                                                        : item,
                                                ),
                                            )
                                        }
                                        required
                                    />
                                </AntForm.Item>
                            </div>
                        </AntCard>
                    ))}
                    <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() =>
                            setSessionDrafts((current) => [
                                ...current,
                                defaultSessionDraft(current),
                            ])
                        }>
                        Add session
                    </Button>
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
    const { mutateAsync: updateProgramRequest } = useUpdate();
    const { mutateAsync: createProgramRequest } = useCreate();
    const { mutateAsync: deleteProgramRequest } = useDelete();
    const { mutateAsync: customMutate } = useCustomMutation();
    const invalidate = useInvalidate();
    const invalidateThisRequest = () =>
        invalidate({
            resource: 'program-requests',
            id: request.Id,
            invalidates: ['list', 'many', 'detail'],
        });
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const deletable =
        ['draft', 'cancelled', 'rejected'].includes(request.Status) &&
        (canApprove(dashboard.me) || owner);
    const [editing, setEditing] = useState(false);
    const [sessions, setSessions] = useState<ProgramSession[]>(request.sessions);
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [sessionTypeError, setSessionTypeError] = useState(false);
    const [pendingAction, setPendingAction] = useState<ProgramRequestAction | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [duplicateDate, setDuplicateDate] = useState('');
    const [duplicateBusy, setDuplicateBusy] = useState(false);
    const [duplicateError, setDuplicateError] = useState('');
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>(() =>
        defaultSessionDraft(request.sessions),
    );
    const [rescheduleDate, setRescheduleDate] = useState(() =>
        request.sessions.length ? getLocalDateFromSession(request.sessions[0].StartDateTime) : '',
    );
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canApprove(dashboard.me) },
    });
    const users = usersResult.data;
    const [values, setValues] = useState({
        Name: request.Name,
        Language: request.Language,
        Type: request.Type,
        PlaceId: request.PlaceId,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
        Status: request.Status,
    });
    const [availablePlaceIds, setAvailablePlaceIds] = useState<string[]>([]);
    const [availablePlacesLoading, setAvailablePlacesLoading] = useState(true);
    useEffect(() => {
        setAvailablePlacesLoading(true);
        setAvailablePlaceIds([]);
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
            .catch(error)
            .finally(() => setAvailablePlacesLoading(false));
    }, [request.Id, sessions]);
    const availablePlaceOptions = dashboard.places.filter((place) =>
        availablePlaceIds.includes(place.Id),
    );
    const placeOptions = availablePlaceOptions;
    const persistSessions = async (nextSessions: ProgramSession[]) => {
        try {
            showSavingBadge(true);
            await updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
            setSessions(nextSessions);
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const save = useSave(
        () =>
            updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: sessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            }).catch((e) => {
                setValues({
                    Name: request.Name,
                    Language: request.Language,
                    Type: request.Type,
                    PlaceId: request.PlaceId,
                    DepartmentId: request.DepartmentId,
                    LeadEmail: request.LeadEmail,
                    Participants: request.participants.join(', '),
                    UserId: request.UserId,
                    Status: request.Status,
                });
                setSessions(request.sessions);
                throw e;
            }),
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await customMutate({
                url: 'updateProgramRequestParticipants',
                method: 'post',
                values: {},
                meta: {
                    operation: 'updateProgramRequestParticipants',
                    args: [request.Id, { participants: serialized }, generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            setValues((current) => ({ ...current, Participants: serialized }));
            await invalidateThisRequest();
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
        }
    };
    const openDuplicate = () => {
        setDuplicateError('');
        setDuplicateDate(sessions.length ? getLocalDateFromSession(sessions[0].StartDateTime) : '');
        setDuplicateOpen(true);
    };
    const duplicate = async (event?: FormEvent) => {
        event?.preventDefault();
        if (event) {
            const form = event.currentTarget as HTMLFormElement;
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
        }
        setDuplicateError('');
        setDuplicateBusy(true);
        setDuplicateOpen(false);
        setDuplicating(true);
        try {
            showSavingBadge(true);
            const nextSessions =
                sessions.length && duplicateDate
                    ? shiftProgramSessions(sessions, duplicateDate)
                    : sessions;
            const created = await createProgramRequest({
                resource: 'program-requests',
                values: buildDuplicateProgramInput(request, dashboard.me.Email, nextSessions),
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
            navigateToProgram((created.data as unknown as { Id: string }).Id);
        } catch (e) {
            setDuplicateError(e instanceof Error ? e.message : String(e));
            setDuplicating(false);
            setDuplicateOpen(true);
        } finally {
            setDuplicateBusy(false);
            showSavingBadge(false);
        }
    };
    const rescheduleSave = useSave(
        async () => {
            if (!rescheduleDate) throw new Error('Select a new first session date.');
            const nextSessions = shiftProgramSessions(sessions, rescheduleDate);
            await updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
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
            await customMutate({
                url: 'performProgramRequestAction',
                method: 'post',
                values: {},
                meta: {
                    operation: 'performProgramRequestAction',
                    args: [request.Id, action, '', generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            await invalidateThisRequest();
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
    const needsAllocation =
        canApprove(dashboard.me) && request.Status === 'submitted' && !request.PlaceId;
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
        { title: 'Title', dataIndex: 'Name', key: 'Name' },
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
    if (duplicating) {
        return <AppLoading />;
    }
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
                    {request.Status !== 'draft' && (
                        <Button
                            aria-label="Duplicate program"
                            title="Duplicate program"
                            onClick={openDuplicate}>
                            Duplicate
                        </Button>
                    )}
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
                    {actions.length > 0 && (
                        <WorkflowActions
                            actions={actions}
                            onAction={(action) => setPendingAction(action as ProgramRequestAction)}
                        />
                    )}
                    {needsAllocation && (
                        <Button
                            type="primary"
                            disabled={canApprove(dashboard.me) && availablePlacesLoading}
                            onClick={() => setEditing(true)}>
                            Allocate
                        </Button>
                    )}
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
                            disabled={canApprove(dashboard.me) && availablePlacesLoading}
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
                        ['Program title', request.Name],
                        ['Language', request.Language],
                        ['Type', request.Type],
                        ['Place', request.placeName || 'None'],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', request.LeadEmail],
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
            <DetailSection className="table-detail-section">
                <TableView
                    title="Sessions"
                    count={sessions.length}
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
                        <Table
                            rowKey="key"
                            columns={sessionColumns}
                            dataSource={sessionRows}
                            pagination={false}
                            className="sessions-table"
                            scroll={{ x: 'max-content' }}
                        />
                    ) : (
                        <Empty>No sessions added.</Empty>
                    )}
                </TableView>
            </DetailSection>
            <DetailSection className="activity-detail-section">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        setPendingAction(null);
                        void perform(pendingAction);
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
                            await deleteProgramRequest({
                                resource: 'program-requests',
                                id: request.Id,
                                successNotification: false,
                                errorNotification: false,
                            });
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
                                    <Select.Option key={language.Name} value={language.Name}>
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
                            onChange={(e) => update('Name', e.target.value)}
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
                        <AntForm.Item label="Status" required>
                            <Select
                                value={values.Status}
                                onChange={(value) => update('Status', value)}
                                disabled={!canApprove(dashboard.me)}
                                style={{ width: '100%' }}>
                                {PROGRAM_REQUEST_STATUSES.map((status) => (
                                    <Select.Option key={status} value={status}>
                                        {status}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <AntForm.Item label="Place">
                            <Select
                                value={values.PlaceId}
                                onChange={(value) => update('PlaceId', value)}
                                disabled={!canApprove(dashboard.me)}
                                loading={availablePlacesLoading}
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
                                            {requesterOptionLabel(u)}
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
            {rescheduling && (
                <Modal title="Reschedule program" close={() => setRescheduling(false)}>
                    <form className="grid gap-3" noValidate onSubmit={rescheduleSave.run}>
                        <Typography.Text type="secondary">
                            Moves every session together, keeping the gaps between them, so the
                            first session starts on this date.
                        </Typography.Text>
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
            {duplicateOpen && (
                <Modal title="Duplicate program" close={() => setDuplicateOpen(false)}>
                    <form className="grid gap-3" noValidate onSubmit={duplicate}>
                        {sessions.length > 0 ? (
                            <>
                                <Typography.Text type="secondary">
                                    The copy keeps the same sessions, moved together so the first
                                    session starts on this date.
                                </Typography.Text>
                                <TextField
                                    name="duplicateFirstSessionDate"
                                    label="First session date"
                                    type="date"
                                    value={duplicateDate}
                                    required
                                    onChange={(event) => setDuplicateDate(event.target.value)}
                                />
                            </>
                        ) : (
                            <Typography.Text type="secondary">
                                This program has no sessions to schedule.
                            </Typography.Text>
                        )}
                        <SaveFooter
                            label="Duplicate"
                            busy={duplicateBusy}
                            errorMessage={duplicateError}
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
                        <Select.Option key={t.Name} value={t.Name}>
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
        const trimmed = comment.trim();
        if (!trimmed) return;
        setComment('');
        try {
            showSavingBadge(true);
            const added = await api.addComment(requestId, trimmed, generateRequestId());
            setComments((current) => [...current, added]);
            // The dashboard's cached request lists aren't patched with the new
            // comment, so a later visit would show the request without it until
            // this quiet refresh catches it up.
            void refreshDashboard().catch(() => undefined);
        } catch (e) {
            setComment(trimmed);
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
                <form className="flex items-end gap-2" onSubmit={submit}>
                    <Input.TextArea
                        size="small"
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                            }
                        }}
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
    const { mutateAsync: updateInventoryRequest } = useUpdate();
    const { mutateAsync: deleteInventoryRequest } = useDelete();
    const { mutateAsync: customMutate } = useCustomMutation();
    const invalidate = useInvalidate();
    const invalidateThisRequest = () =>
        invalidate({
            resource: 'inventory-requests',
            id: request.Id,
            invalidates: ['list', 'many', 'detail'],
        });
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
        InventoryTypeId: '',
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
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canApprove(dashboard.me) },
    });
    const users = usersResult.data;
    const update = (key: keyof typeof values, value: string) =>
        setValues((current) => ({ ...current, [key]: value }));
    const persistItems = async (nextItems: InventoryItemDTO[]): Promise<boolean> => {
        const previousItems = items;
        try {
            setItemError('');
            showSavingBadge(true);
            setItems(nextItems);
            await updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
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
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
            return true;
        } catch (e) {
            setItems(previousItems);
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
        () =>
            updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
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
                successNotification: false,
                errorNotification: false,
            }).catch((e) => {
                setValues({
                    Name: request.Name,
                    StartDate: request.StartDate,
                    EndDate: request.EndDate,
                    DepartmentId: request.DepartmentId,
                    LeadEmail: request.LeadEmail,
                    Participants: request.participants.join(', '),
                    UserId: request.UserId,
                });
                setItems(request.items);
                throw e;
            }),
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await customMutate({
                url: 'updateInventoryRequestParticipants',
                method: 'post',
                values: {},
                meta: {
                    operation: 'updateInventoryRequestParticipants',
                    args: [request.Id, { participants: serialized }, generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            setValues((current) => ({ ...current, Participants: serialized }));
            await invalidateThisRequest();
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
                      InventoryTypeId: '',
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
    const selectedInventoryType = dashboard.inventoryTypes.find(
        (type) => type.Id === itemDraft.InventoryTypeId,
    );
    const uploadRequestImage = async (file: File) => {
        if (!file) return;
        try {
            setImageUploading(true);
            showSavingBadge(true);
            const prepared = await prepareInventoryImage(file);
            const upload = await api.createImageUploadUrl(prepared.fileName, prepared.mimeType);
            const { error: uploadError } = await supabase()
                .storage.from('request-images')
                .uploadToSignedUrl(upload.path, upload.token, prepared.blob);
            if (uploadError) throw uploadError;
            const nextImageId = upload.path;
            setImageId(nextImageId);
            await updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
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
                successNotification: false,
                errorNotification: false,
            });
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
            await customMutate({
                url: 'performInventoryRequestAction',
                method: 'post',
                values: {},
                meta: {
                    operation: 'performInventoryRequestAction',
                    args: [request.Id, action, '', null, generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            await invalidateThisRequest();
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
                        ['Request name', request.Name],
                        ['Start date', request.StartDate],
                        ['End date', request.EndDate],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', request.LeadEmail],
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
            <DetailSection className="table-detail-section">
                <TableView
                    title="Requested items"
                    count={items.length}
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
                    ) : (
                        <Empty>No items added.</Empty>
                    )}
                </TableView>
            </DetailSection>
            <DetailSection
                title="Image"
                className="inventory-image-section"
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
                    <RequestImage
                        imageId={imageId}
                        alt="Inventory request"
                        className="inventory-request-image"
                        fallback={
                            <Typography.Text type="secondary">No image added.</Typography.Text>
                        }
                    />
                </div>
            </DetailSection>
            <DetailSection className="activity-detail-section">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {editing && (
                <Modal title="Edit inventory request" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <TextField
                            name="name"
                            label="Event / Purpose"
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
                                            {requesterOptionLabel(user)}
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
                        <QrScanner onScan={scanInventoryType} />
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
                                value={itemDraft.InventoryTypeId || undefined}
                                onChange={(value) =>
                                    setItemDraft((current) => ({
                                        ...current,
                                        InventoryTypeId: value,
                                    }))
                                }
                                style={{ width: '100%' }}
                                placeholder="Select inventory type">
                                {dashboard.inventoryTypes.map((type) => (
                                    <Select.Option key={type.Id} value={type.Id}>
                                        {type.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                            {selectedInventoryType && (
                                <div className="inventory-type-detail-image mt-3">
                                    <RequestImage
                                        imageId={selectedInventoryType.ImageId}
                                        alt={selectedInventoryType.Name}
                                        fallback={<span>No photo</span>}
                                    />
                                </div>
                            )}
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
                                disabled={!canApprove(dashboard.me)}
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
                        setPendingAction(null);
                        void perform(pendingAction);
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
                            await deleteInventoryRequest({
                                resource: 'inventory-requests',
                                id: request.Id,
                                successNotification: false,
                                errorNotification: false,
                            });
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

function Detail({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get(kind === 'inventory' ? 'inventoryRequest' : 'programRequest');
    const resource = kind === 'inventory' ? 'inventory-requests' : 'program-requests';
    // Fetches this one record through the resource's own getOne operation
    // rather than finding it in dashboard.inventoryRequests/programRequests —
    // that array is truncated to the most recently active requests, so an
    // older one wouldn't be found there even though it still exists.
    const { result: row, query } = useOne<InventoryRequestDTO | ProgramRequestDTO>({
        resource,
        id: id || '',
        queryOptions: { enabled: Boolean(id) },
        // A missing/deleted record is a normal "not found" navigation state
        // here, not something to alert the user about with a toast.
        errorNotification: false,
    });
    const back = kind === 'inventory' ? navigateToInventoryRequests : navigateToPrograms;
    if (id && query.isLoading) {
        return (
            <Page title="Loading request…">
                <Typography.Text>Loading request…</Typography.Text>
            </Page>
        );
    }
    if (!row) {
        return params.get('mode') === 'create' ? (
            <CreateRecord kind={kind} dashboard={dashboard} onClose={back} />
        ) : (
            <Page title="Not found">
                <Card title="Record not found">
                    <Button onClick={back}>Back</Button>
                </Card>
            </Page>
        );
    }
    if (kind === 'inventory')
        return (
            <InventoryDetail
                key={row.Id}
                request={row as InventoryRequestDTO}
                dashboard={dashboard}
            />
        );
    return <ProgramDetail key={row.Id} request={row as ProgramRequestDTO} dashboard={dashboard} />;
}

export function renderRefineApp(
    section: string,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    const params = new URLSearchParams(window.location.search);
    let page: ReactNode;
    if (section === 'home') page = <Home dashboard={dashboard} />;
    else if (section === 'profile') page = <Profile dashboard={dashboard} />;
    else if (section === 'users') page = <Users dashboard={dashboard} />;
    else if (section === 'roster') page = <Roster dashboard={dashboard} />;
    else if (section === 'calendar') page = <Calendar dashboard={dashboard} />;
    else if (['inventory', 'programs'].includes(section)) {
        const detail =
            Boolean(params.get(section === 'inventory' ? 'inventoryRequest' : 'programRequest')) ||
            params.get('mode') === 'create';
        page = detail ? (
            <Detail
                key={section}
                kind={section as 'inventory' | 'programs'}
                dashboard={dashboard}
            />
        ) : (
            <RequestTable
                key={section}
                kind={section as 'inventory' | 'programs'}
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
