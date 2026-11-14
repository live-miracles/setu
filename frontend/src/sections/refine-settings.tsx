import { useEffect, useState, type FormEvent } from 'react';
import { useList } from '@refinedev/core';
import { Button, Card, Empty, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { showErrorAlert } from '../ui/feedback';
import { formatDateTime } from '../ui/format';
import { formatDateTimeLocal } from '../ui/date';
import { matchesSearch } from '../ui/search';
import { TableView } from '../ui/table-view';
import { useDashboard } from '../dashboard-context';
import { ActionConfirmation } from './refine-shared';
import {
    Editor,
    rowKeyOf,
    useResourceMutations,
    type ResourceConfig,
    type Row,
} from './settings-editor';
import { canManageConfig } from '../workflows';

const iso = (raw: string) => (raw ? new Date(raw).toISOString() : '');
// Every settings resource's create/update payload has the same shape (see
// refine-data-provider.ts, which does the actual api.ts call + dedupe id) —
// this only translates the form's uppercase field names (matching
// fields[].field) into the lowercase CreateXInput/UpdateXInput shape.
// Departments and inventory types have their own pages (departments.tsx,
// inventory-types.tsx); this shell serves only the simple resources below,
// which the Other settings page lists together.
const sortByName = (rows: Row[]) =>
    [...rows].sort((a, b) =>
        String(a.Name).localeCompare(String(b.Name), undefined, {
            numeric: true,
            sensitivity: 'base',
        }),
    );

const RESOURCES: Record<string, ResourceConfig> = {
    places: {
        kind: 'program place',
        title: 'Program places',
        addLabel: 'Add program place',
        emptyMessage: 'No program places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        sortRows: sortByName,
        toInput: (v) => ({ name: v.Name }),
    },
    'inventory-places': {
        kind: 'inventory place',
        title: 'Inventory places',
        addLabel: 'Add inventory place',
        emptyMessage: 'No inventory places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        sortRows: sortByName,
        toInput: (v) => ({ name: v.Name }),
    },
    blocks: {
        kind: 'block',
        title: 'Blocks',
        addLabel: 'Add block',
        emptyMessage: 'No blocked times configured yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            {
                field: 'StartDateTime',
                label: 'Start',
                type: 'datetime-local',
                defaultValue: () => todayAt(10),
            },
            {
                field: 'EndDateTime',
                label: 'End',
                type: 'datetime-local',
                defaultValue: () => todayAt(22),
            },
            {
                field: 'Place',
                label: 'Place (optional)',
                type: 'select',
                optionsResource: 'places',
                optionsLabel: 'All places',
            },
        ],
        toInput: (v) => ({
            name: v.Name,
            startDateTime: iso(v.StartDateTime),
            endDateTime: iso(v.EndDateTime),
            place: v.Place,
        }),
    },
    'shift-types': {
        kind: 'shift-type',
        title: 'Shift types',
        addLabel: 'Add shift type',
        emptyMessage: 'No shift types yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'DefaultStartTime', label: 'Start time (optional)', type: 'time' },
            { field: 'DefaultEndTime', label: 'End time (optional)', type: 'time' },
            { field: 'Color', label: 'Color', type: 'color' },
        ],
        rowKey: (row) => String(row.Name),
        toInput: (v) => ({
            name: v.Name,
            defaultStartTime: v.DefaultStartTime || null,
            defaultEndTime: v.DefaultEndTime || null,
            color: v.Color,
        }),
    },
    'program-types': {
        kind: 'program-type',
        title: 'Program types',
        addLabel: 'Add program type',
        emptyMessage: 'No program types configured yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Color', label: 'Color', type: 'color' },
        ],
        rowKey: (row) => String(row.Name),
        toInput: (v) => ({ name: v.Name, color: v.Color }),
    },
    'program-languages': {
        kind: 'program-language',
        title: 'Program languages',
        addLabel: 'Add language',
        emptyMessage: 'No languages configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rowKey: (row) => String(row.Name),
        toInput: (v) => ({ name: v.Name }),
    },
    'session-types': {
        kind: 'session-type',
        title: 'Session types',
        addLabel: 'Add session type',
        emptyMessage: 'No session types configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rowKey: (row) => String(row.Name),
        toInput: (v) => ({ name: v.Name }),
    },
};

function todayAt(hours: number, minutes = 0): string {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return formatDateTimeLocal(date);
}

export function SettingsResourcePage({
    resourceName,
    dashboard,
    compact = false,
}: {
    resourceName: string;
    dashboard: DashboardPayload;
    compact?: boolean;
}) {
    const config = RESOURCES[resourceName];
    if (!config) throw new Error(`Unknown settings resource: ${resourceName}`);
    const canEdit = canManageConfig(dashboard.me);
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result } = useList({ resource: resourceName, pagination: { mode: 'off' } });
    const rawRows = result.data as Row[];
    const rows = config.sortRows ? config.sortRows(rawRows) : rawRows;
    const { save, remove } = useResourceMutations(resourceName, config);
    // blocks' Place field is the only select today — its options come from
    // its own useList (called unconditionally like every other hook here;
    // `enabled: false` skips the request for every other resource kind)
    // rather than the shared dashboard blob.
    const selectField = config.fields.find((f) => f.type === 'select' && f.optionsResource);
    const { result: selectOptionsResult } = useList({
        resource: selectField?.optionsResource || '',
        pagination: { mode: 'off' },
        queryOptions: { enabled: Boolean(selectField) },
    });
    const selectOptionLabelById = new Map(
        (selectOptionsResult.data as Row[]).map((row) => [
            String(row.Id ?? row.Name ?? ''),
            String(row.Name ?? row.Id ?? ''),
        ]),
    );
    const [search, setSearch] = useState('');
    const hasSearch = true;
    const filteredRows = rows.filter((row) => matchesSearch(search, Object.values(row)));
    const beginCreate = () => setCreating(true);
    const beginEdit = (row: Row) => setEditing(row);
    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };
    const renderActions = (row: Row) => (
        <Space size={0}>
            {canEdit && (
                <>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => beginEdit(row)}
                        aria-label="Edit"
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setDeleting(row)}
                        aria-label="Delete"
                    />
                </>
            )}
        </Space>
    );
    const columns = [
        ...config.fields
            .filter((field) => !field.hiddenInTable)
            .map((field) => ({
                title: field.label,
                dataIndex: field.field,
                key: field.field,
                render: (value: unknown) => {
                    if (field.type === 'color') {
                        const color = String(value || '').trim();
                        const validColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);
                        return validColor ? (
                            <Space size="small">
                                <span
                                    className="settings-color-swatch"
                                    style={{ backgroundColor: color }}
                                    aria-hidden="true"
                                />
                                <span style={{ color }}>{color}</span>
                            </Space>
                        ) : (
                            <span className="text-xs opacity-60">No color</span>
                        );
                    }
                    if (field.type === 'datetime-local') return formatDateTime(String(value || ''));
                    if (field.type === 'select' && field.optionsResource) {
                        return (
                            selectOptionLabelById.get(String(value ?? '')) ?? String(value ?? '')
                        );
                    }
                    return String(value ?? '');
                },
            })),
        {
            title: 'Actions',
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, row: Row) => renderActions(row),
        },
    ];
    return (
        <section
            className={`${compact ? 'antd-settings-compact' : 'antd-page'}${
                config.kind === 'block' ? ' blocks-page' : ''
            }`}>
            <div>
                <TableView
                    title={config.title}
                    count={rows.length}
                    action={
                        canEdit ? (
                            <Button
                                type="primary"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={beginCreate}
                                aria-label={`Add ${config.kind}`}
                                title={`Add ${config.kind}`}
                            />
                        ) : null
                    }
                    searchValue={hasSearch ? search : undefined}
                    onSearch={hasSearch ? setSearch : undefined}
                    searchPlaceholder={`Search ${config.title.toLowerCase()}`}>
                    <Table
                        rowKey={(row) => rowKeyOf(config, row)}
                        columns={columns}
                        dataSource={filteredRows}
                        locale={{ emptyText: <Empty description={config.emptyMessage} /> }}
                        pagination={false}
                    />
                </TableView>
            </div>
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Delete “${deleting[config.fields[0].field]}”?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        const row = deleting;
                        setDeleting(null);
                        await remove(row);
                    }}
                />
            )}
            {canEdit && (creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    onClose={closeEditor}
                    onSaved={async (values) => {
                        await save(values, editing);
                    }}
                />
            )}
        </section>
    );
}

export function HomeContentPage({ dashboard }: { dashboard: DashboardPayload }) {
    const { refreshDashboard } = useDashboard();
    const [savingGuidelines, setSavingGuidelines] = useState(false);
    const canEdit = canManageConfig(dashboard.me);

    async function saveGuidelines(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSavingGuidelines(true);
        const data = new FormData(event.currentTarget);
        const guidelines = String(data.get('guidelines') || '');
        try {
            await api.updateHomeContent({ guidelines });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setSavingGuidelines(false);
        }
    }

    return (
        <section className="antd-page">
            <Card title="Guidelines" className="settings-form-card">
                <form onSubmit={saveGuidelines}>
                    <Form.Item>
                        <Input.TextArea
                            name="guidelines"
                            aria-label="Guidelines"
                            rows={6}
                            defaultValue={dashboard.homeContent.Guidelines}
                        />
                    </Form.Item>
                    {canEdit && (
                        <Button type="primary" htmlType="submit" loading={savingGuidelines}>
                            Save
                        </Button>
                    )}
                </form>
            </Card>
            <AllowedEmailDomainsPage dashboard={dashboard} />
            {(
                [
                    'places',
                    'inventory-places',
                    'shift-types',
                    'program-types',
                    'program-languages',
                    'session-types',
                ] as const
            ).map((key) => (
                <SettingsResourcePage key={key} resourceName={key} dashboard={dashboard} compact />
            ))}
        </section>
    );
}

function AllowedEmailDomainsPage({ dashboard }: { dashboard: DashboardPayload }) {
    const canEdit = canManageConfig(dashboard.me);
    const [domains, setDomains] = useState<AllowedEmailDomain[]>([]);
    const [domain, setDomain] = useState('');
    const [loading, setLoading] = useState(canEdit);
    const [saving, setSaving] = useState(false);
    const [domainEditorOpen, setDomainEditorOpen] = useState(false);
    const [domainError, setDomainError] = useState('');

    useEffect(() => {
        if (!canEdit) return;
        let active = true;
        void api
            .listAllowedEmailDomains()
            .then((rows) => {
                if (active) setDomains(rows);
            })
            .catch(showErrorAlert)
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [canEdit]);

    if (!canEdit) return null;

    async function addDomain(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalized = domain.trim().toLowerCase().replace(/^@/, '');
        if (!normalized) {
            setDomainError('Enter a domain.');
            return;
        }
        if (domains.some((entry) => entry.domain === normalized)) {
            setDomainError('That domain is already allowed.');
            return;
        }
        setSaving(true);
        setDomainError('');
        try {
            const added = await api.createAllowedEmailDomain(
                { domain: normalized },
                generateRequestId(),
            );
            setDomains((current) =>
                [...current, added].sort((a, b) => a.domain.localeCompare(b.domain)),
            );
            setDomain('');
            setDomainEditorOpen(false);
        } catch (error) {
            setDomainError(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    async function removeDomain(value: string) {
        setSaving(true);
        try {
            await api.deleteAllowedEmailDomain(value, generateRequestId());
            setDomains((current) => current.filter((entry) => entry.domain !== value));
        } catch (error) {
            setDomainError(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card title="Allowed email domains" className="settings-form-card" loading={loading}>
            <Typography.Paragraph type="secondary">
                {domains.length
                    ? 'Only users with an email address from one of these domains can sign in.'
                    : 'No domains are configured. Users from any email domain can sign in.'}
            </Typography.Paragraph>
            <div className="flex flex-wrap items-center gap-2">
                {domains.map((entry) => (
                    <Tag
                        key={entry.domain}
                        closable={!saving}
                        onClose={(event) => {
                            event.preventDefault();
                            void removeDomain(entry.domain);
                        }}>
                        {entry.domain}
                    </Tag>
                ))}
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={saving}
                    aria-label="Add allowed email domain"
                    title="Add allowed email domain"
                    onClick={() => {
                        setDomainError('');
                        setDomainEditorOpen(true);
                    }}
                />
                {domainError && (
                    <Typography.Text type="danger" className="basis-full text-sm">
                        {domainError}
                    </Typography.Text>
                )}
            </div>
            {domainEditorOpen && (
                <Modal
                    open
                    title="Add allowed email domain"
                    footer={null}
                    destroyOnHidden
                    onCancel={() => {
                        if (!saving) setDomainEditorOpen(false);
                    }}>
                    <form className="grid gap-3" onSubmit={addDomain}>
                        <Form.Item label="Domain" required>
                            <Input
                                type="text"
                                value={domain}
                                autoFocus
                                placeholder="myorg.com"
                                onChange={(event) => setDomain(event.target.value)}
                            />
                        </Form.Item>
                        <div className="flex items-center gap-2">
                            <Button type="primary" htmlType="submit" loading={saving}>
                                Add
                            </Button>
                            {domainError && (
                                <Typography.Text type="danger" className="text-sm">
                                    {domainError}
                                </Typography.Text>
                            )}
                        </div>
                    </form>
                </Modal>
            )}
        </Card>
    );
}
