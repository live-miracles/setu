import { useRef, useState } from 'react';
import { useCreate, useList } from '@refinedev/core';
import {
    Button,
    Card as AntCard,
    Empty as AntEmpty,
    Form as AntForm,
    Input,
    Pagination,
    Select,
    Space,
    Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
    navigateToInventoryRequest,
    navigateToProgram,
    inventoryRequestUrl,
    programRequestUrl,
    refreshDashboard,
    replaceWorkbenchUrl,
} from '../router';
import {
    WORKBENCH_SEARCH_QUERY_PARAM,
    WORKBENCH_STATUS_QUERY_PARAM,
    WORKBENCH_VIEW_QUERY_PARAM,
} from '../config';
import { createRecordDestination } from '../ui/create-record';
import { RequestBlock } from '../ui/request-block';
import { AppLoading, setAppLoading } from '../ui/app-loading';
import { formatDateTimeLocal } from '../ui/date';
import { canApprove } from '../workflows';
import { Modal, Page, SaveFooter, TextField, useSave } from './refine-shared';

type Props = { dashboard: DashboardPayload };

export const OTHER_PROGRAM_TYPE = 'Other';
export const PROGRAM_REQUEST_STATUSES: ProgramRequestStatus[] = [
    'draft',
    'submitted',
    'approved',
    'rejected',
    'cancelled',
];
export const requesterOptionLabel = (user: UserDTO): string => user.Name + ' <' + user.Email + '>';

export function programTypeOptions(programTypes: ProgramType[], current = ''): string[] {
    const names = [...programTypes.map((programType) => programType.Name), OTHER_PROGRAM_TYPE];
    if (current) names.unshift(current);
    return names.filter(
        (name, index) =>
            Boolean(name) &&
            names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) ===
                index,
    );
}

export function defaultSessionDraft(sessions: ProgramSession[]): ProgramSession {
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

export function RequestBoard({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
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

export function RequestTable({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
    return <RequestBoard kind={kind} dashboard={dashboard} />;
}

export function CreateRecord({
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
