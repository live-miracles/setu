import { useEffect, useState, type FormEvent } from 'react';
import { useInvalidate, useList } from '../ui/resources';
import { useHomeContent, useMe } from '../ui/reference';
import { Input, TextArea, Field } from '../ui/form-kit';
import { Modal } from '../ui/overlay-kit';
import { Table, Button, Card, Checkbox, Empty, Space, Tag, Typography } from '../ui/kit';
import { HIDEABLE_VIEWS, VIEW_LABELS, isViewVisible } from '../ui/views';
import { Icon } from '../ui/icons';
import { api } from '../api';
import { showErrorAlert } from '../ui/feedback';
import { formatDateTime, formatTimeOfDay } from '../ui/format';
import { formatDateTimeLocal } from '../ui/date';
import { toneProps } from '../ui/tone';
import { matchesSearch } from '../ui/search';
import { BlockCard } from '../ui/block-card';
import { TableView } from '../ui/table-view';
import { ActionConfirmation } from './action-confirmation';
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
// ui/resources.ts, which does the actual api.ts call + dedupe id) —
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
        layout: 'blocks',
        title: 'Program places',
        addLabel: 'Add program place',
        emptyMessage: 'No program places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        sortRows: sortByName,
        toInput: (v) => ({ name: v.Name }),
    },
    'inventory-brands': {
        kind: 'inventory brand',
        layout: 'blocks',
        title: 'Inventory brands',
        addLabel: 'Add inventory brand',
        emptyMessage: 'No inventory brands yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        sortRows: sortByName,
        toInput: (v) => ({ name: v.Name }),
    },
    'inventory-places': {
        kind: 'inventory place',
        layout: 'blocks',
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
        layout: 'blocks',
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
        describe: (row) =>
            [row.DefaultStartTime, row.DefaultEndTime]
                .map((time) => formatTimeOfDay(String(time ?? '')))
                .filter(Boolean)
                .join(' – '),
        toInput: (v) => ({
            name: v.Name,
            defaultStartTime: v.DefaultStartTime || null,
            defaultEndTime: v.DefaultEndTime || null,
            color: v.Color,
        }),
    },
    'program-types': {
        kind: 'program-type',
        layout: 'blocks',
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
        layout: 'blocks',
        title: 'Program languages',
        addLabel: 'Add language',
        emptyMessage: 'No languages configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rowKey: (row) => String(row.Name),
        toInput: (v) => ({ name: v.Name }),
    },
    'session-types': {
        kind: 'session-type',
        layout: 'blocks',
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
    compact = false,
}: {
    resourceName: string;
    compact?: boolean;
}) {
    const config = RESOURCES[resourceName];
    if (!config) throw new Error(`Unknown settings resource: ${resourceName}`);
    const canEdit = canManageConfig(useMe());
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result } = useList({ resource: resourceName, pagination: { mode: 'off' } });
    const rawRows = result.data as Row[];
    const rows = config.sortRows ? config.sortRows(rawRows) : rawRows;
    const { save, remove } = useResourceMutations(resourceName, config);
    // blocks' Place field is the only select today — its options come from
    // its own useList (called unconditionally like every other hook here;
    // `enabled: false` skips the request for every other resource kind).
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
    // Inventory places show how many labels sit there. A label with no place
    // of its own counts under its type's place, as in the QR sticker groups.
    const countsLabels = resourceName === 'inventory-places';
    const { result: inventoryTypesResult } = useList({
        resource: 'inventory-types',
        pagination: { mode: 'off' },
        queryOptions: { enabled: countsLabels },
    });
    const labelCountByPlace = new Map<string, number>();
    if (countsLabels) {
        (inventoryTypesResult.data as Row[]).forEach((type) =>
            ((type.labels as Row[] | undefined) ?? []).forEach((label) => {
                const placeId = String(label.LocationId || type.LocationId || '');
                if (placeId)
                    labelCountByPlace.set(placeId, (labelCountByPlace.get(placeId) ?? 0) + 1);
            }),
        );
    }
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
                        icon={<Icon name="edit" />}
                        onClick={() => beginEdit(row)}
                        aria-label="Edit"
                    />
                    <Button
                        type="text"
                        danger
                        icon={<Icon name="trash" />}
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
            className={`${compact ? 'settings-compact' : 'app-page'}${
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
                                icon={<Icon name="plus" />}
                                onClick={beginCreate}
                                aria-label={`Add ${config.kind}`}
                                title={`Add ${config.kind}`}
                            />
                        ) : null
                    }
                    searchValue={hasSearch ? search : undefined}
                    onSearch={hasSearch ? setSearch : undefined}
                    searchPlaceholder={`Search ${config.title.toLowerCase()}`}>
                    {config.layout === 'blocks' ? (
                        filteredRows.length > 0 ? (
                            <div className="settings-block-grid">
                                {filteredRows.map((row) => {
                                    const tone = toneProps(
                                        String(row.Color ?? ''),
                                        'settings-block',
                                        ['accent'],
                                    );
                                    const description = config.describe?.(row);
                                    return (
                                        <BlockCard
                                            key={rowKeyOf(config, row)}
                                            className={tone.className}
                                            style={tone.style}>
                                            <div className="settings-block-text">
                                                <strong>{String(row.Name ?? '')}</strong>
                                                {description && <span>{description}</span>}
                                            </div>
                                            {countsLabels && (
                                                <span
                                                    className="ml-auto"
                                                    title="Inventory labels at this place">
                                                    <Tag>
                                                        {labelCountByPlace.get(String(row.Id)) ?? 0}
                                                    </Tag>
                                                </span>
                                            )}
                                            {renderActions(row)}
                                        </BlockCard>
                                    );
                                })}
                            </div>
                        ) : (
                            <Empty description={config.emptyMessage} />
                        )
                    ) : (
                        <Table
                            rowKey={(row) => rowKeyOf(config, row)}
                            columns={columns}
                            dataSource={filteredRows}
                            locale={{ emptyText: <Empty description={config.emptyMessage} /> }}
                            pagination={false}
                        />
                    )}
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

export function HomeContentPage() {
    const invalidate = useInvalidate();
    const homeContent = useHomeContent();
    const [savingGuidelines, setSavingGuidelines] = useState(false);
    const canEdit = canManageConfig(useMe());

    async function saveGuidelines(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSavingGuidelines(true);
        const data = new FormData(event.currentTarget);
        const guidelines = String(data.get('guidelines') || '');
        try {
            await api.updateHomeContent({ guidelines });
            await invalidate({ resource: 'home-content' });
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setSavingGuidelines(false);
        }
    }

    return (
        <section className="app-page">
            <Card title="Guidelines" className="settings-form-card">
                <form onSubmit={saveGuidelines}>
                    <Field>
                        <TextArea
                            name="guidelines"
                            aria-label="Guidelines"
                            rows={6}
                            defaultValue={homeContent.Guidelines}
                        />
                    </Field>
                    {canEdit && (
                        <Button type="primary" htmlType="submit" loading={savingGuidelines}>
                            Save
                        </Button>
                    )}
                </form>
            </Card>
            <ViewsCard />
            <AllowedEmailDomainsPage />
            {(
                [
                    'places',
                    'inventory-places',
                    'inventory-brands',
                    'shift-types',
                    'program-types',
                    'program-languages',
                    'session-types',
                ] as const
            ).map((key) => (
                <SettingsResourcePage key={key} resourceName={key} compact />
            ))}
        </section>
    );
}

// Which views everyone sees. Unchecked views leave the menu and the home screen;
// the pages for admins and approvers always stay.
function ViewsCard() {
    const invalidate = useInvalidate();
    const homeContent = useHomeContent();
    const canEdit = canManageConfig(useMe());
    const [shown, setShown] = useState<string[]>(() =>
        HIDEABLE_VIEWS.filter((view) => isViewVisible(homeContent, view)),
    );
    const [saving, setSaving] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const hiddenViews = HIDEABLE_VIEWS.filter((view) => !shown.includes(view));
            const saved = await api.updateHomeContent({ hiddenViews });
            // An API that has not been updated yet ignores hiddenViews, or drops
            // a view it does not know yet; say so instead of looking like a save.
            if (
                !Array.isArray(saved?.HiddenViews) ||
                saved.HiddenViews.join() !== hiddenViews.join()
            ) {
                throw new Error(
                    'The server did not save the views. Apply the latest database migration and deploy the API first.',
                );
            }
            await invalidate({ resource: 'home-content' });
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card title="Views" className="settings-form-card">
            <form onSubmit={save}>
                <Typography.Paragraph type="secondary">
                    Unchecked views are hidden from the menu and the home screen for everyone. This
                    only changes what is shown: anyone with a link can still open a hidden view.
                </Typography.Paragraph>
                <div className="mb-3 grid gap-2" role="group" aria-label="Views">
                    {HIDEABLE_VIEWS.map((view) => (
                        <Checkbox
                            key={view}
                            checked={shown.includes(view)}
                            onChange={(event) =>
                                setShown((current) =>
                                    event.target.checked
                                        ? [...current, view]
                                        : current.filter((item) => item !== view),
                                )
                            }>
                            {VIEW_LABELS[view]}
                        </Checkbox>
                    ))}
                </div>
                {canEdit && (
                    <Button type="primary" htmlType="submit" loading={saving}>
                        Save
                    </Button>
                )}
            </form>
        </Card>
    );
}

function AllowedEmailDomainsPage() {
    const canEdit = canManageConfig(useMe());
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
            const added = await api.createAllowedEmailDomain({ domain: normalized });
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
            await api.deleteAllowedEmailDomain(value);
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
                    icon={<Icon name="plus" />}
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
                    title="Add allowed email domain"
                    close={() => {
                        if (!saving) setDomainEditorOpen(false);
                    }}>
                    <form className="grid gap-3" onSubmit={addDomain}>
                        <Field label="Domain" required>
                            <Input
                                type="text"
                                value={domain}
                                autoFocus
                                placeholder="myorg.com"
                                onChange={(event) => setDomain(event.target.value)}
                            />
                        </Field>
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
