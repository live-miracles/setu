import { useEffect, useState, type FormEvent } from 'react';
import { useInvalidate, useList } from '../ui/resources';
import { useHomeContent, useMe } from '../ui/reference';
import { Input, TextArea, Field } from '../ui/form-kit';
import { Modal } from '../ui/overlay-kit';
import {
    Table,
    Button,
    Card,
    Checkbox,
    Empty,
    SortableList,
    Space,
    Tag,
    Typography,
} from '../ui/kit';
import {
    HIDEABLE_VIEWS,
    VIEW_GROUPS,
    VIEW_LABELS,
    isViewVisible,
    orderedViews,
    type HideableView,
} from '../ui/views';
import { Icon } from '../ui/icons';
import { reorderSubset } from '../ui/sortable';
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
            <EmailCcAddressesCard />
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
    const [order, setOrder] = useState<HideableView[]>(() => orderedViews(homeContent));
    const [saving, setSaving] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const hiddenViews = HIDEABLE_VIEWS.filter((view) => !shown.includes(view));
            const saved = await api.updateHomeContent({ hiddenViews, viewOrder: order });
            // An API that has not been updated yet ignores hiddenViews and
            // viewOrder, or drops a view it does not know yet; say so instead
            // of looking like a save.
            if (
                !Array.isArray(saved?.HiddenViews) ||
                saved.HiddenViews.join() !== hiddenViews.join() ||
                !Array.isArray(saved?.ViewOrder) ||
                saved.ViewOrder.join() !== order.join()
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
                    Unchecked views are hidden from the menu and the home screen for everyone. Drag
                    the handles to change the order of the menu and of the switches between boards.
                    This only changes what is shown: anyone with a link can still open a hidden
                    view.
                </Typography.Paragraph>
                <div className="mb-4 grid gap-4 md:grid-cols-2">
                    {VIEW_GROUPS.map((group) => {
                        const shownCount = group.views.filter((view) =>
                            shown.includes(view),
                        ).length;
                        return (
                            <fieldset
                                key={group.key}
                                className="m-0 grid content-start gap-3 rounded-lg border border-line p-4">
                                <legend className="sr-only">{group.title}</legend>
                                <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold">{group.title}</div>
                                        <div className="text-xs text-steel">
                                            {group.description}
                                        </div>
                                    </div>
                                    <Checkbox
                                        checked={shownCount === group.views.length}
                                        indeterminate={
                                            shownCount > 0 && shownCount < group.views.length
                                        }
                                        onChange={(event) =>
                                            setShown((current) => [
                                                ...current.filter(
                                                    (item) =>
                                                        !group.views.includes(item as HideableView),
                                                ),
                                                ...(event.target.checked ? group.views : []),
                                            ])
                                        }>
                                        <span className="whitespace-nowrap text-xs text-steel">
                                            {shownCount} of {group.views.length} shown
                                        </span>
                                    </Checkbox>
                                </div>
                                <SortableList
                                    items={order.filter((view) => group.views.includes(view))}
                                    itemLabel={(view) => VIEW_LABELS[view]}
                                    onChange={(next) =>
                                        setOrder((current) =>
                                            reorderSubset(current, group.views, next),
                                        )
                                    }
                                    renderItem={(view) => (
                                        <Checkbox
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
                                    )}
                                />
                            </fieldset>
                        );
                    })}
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

// A short, admin-managed list shown as removable tags, with a modal to add one.
// onAdd gets the normalized text and either resolves or throws a message the
// modal shows; onRemove deletes one value.
function TagListCard({
    title,
    description,
    addLabel,
    fieldLabel,
    placeholder,
    values,
    loading,
    normalize,
    duplicateMessage,
    onAdd,
    onRemove,
}: {
    title: string;
    description: string;
    addLabel: string;
    fieldLabel: string;
    placeholder: string;
    values: string[];
    loading: boolean;
    normalize: (text: string) => string;
    duplicateMessage: string;
    onAdd: (value: string) => Promise<void>;
    onRemove: (value: string) => Promise<void>;
}) {
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [error, setError] = useState('');

    async function add(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalized = normalize(text);
        if (!normalized) {
            setError(`Enter ${fieldLabel.toLowerCase()}.`);
            return;
        }
        if (values.includes(normalized)) {
            setError(duplicateMessage);
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onAdd(normalized);
            setText('');
            setEditorOpen(false);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setSaving(false);
        }
    }

    async function remove(value: string) {
        setSaving(true);
        try {
            await onRemove(value);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card title={title} className="settings-form-card" loading={loading}>
            <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
            <div className="flex flex-wrap items-center gap-2">
                {values.map((value) => (
                    <Tag
                        key={value}
                        closable={!saving}
                        onClose={(event) => {
                            event.preventDefault();
                            void remove(value);
                        }}>
                        {value}
                    </Tag>
                ))}
                <Button
                    type="primary"
                    size="small"
                    icon={<Icon name="plus" />}
                    disabled={saving}
                    aria-label={addLabel}
                    title={addLabel}
                    onClick={() => {
                        setError('');
                        setEditorOpen(true);
                    }}
                />
                {error && (
                    <Typography.Text type="danger" className="basis-full text-sm">
                        {error}
                    </Typography.Text>
                )}
            </div>
            {editorOpen && (
                <Modal
                    title={addLabel}
                    close={() => {
                        if (!saving) setEditorOpen(false);
                    }}>
                    <form className="grid gap-3" onSubmit={add}>
                        <Field label={fieldLabel} required>
                            <Input
                                type="text"
                                value={text}
                                autoFocus
                                placeholder={placeholder}
                                onChange={(event) => setText(event.target.value)}
                            />
                        </Field>
                        <div className="flex items-center gap-2">
                            <Button type="primary" htmlType="submit" loading={saving}>
                                Add
                            </Button>
                            {error && (
                                <Typography.Text type="danger" className="text-sm">
                                    {error}
                                </Typography.Text>
                            )}
                        </div>
                    </form>
                </Modal>
            )}
        </Card>
    );
}

// Admin-only lists load once and keep their own copy; nothing else reads them.
function useAdminList<T>(load: () => Promise<T[]>, canEdit: boolean) {
    const [rows, setRows] = useState<T[]>([]);
    const [loading, setLoading] = useState(canEdit);
    useEffect(() => {
        if (!canEdit) return;
        let active = true;
        void load()
            .then((loaded) => {
                if (active) setRows(loaded);
            })
            .catch(showErrorAlert)
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
        // `load` is a stable api method; only the permission decides when to fetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canEdit]);
    return { rows, setRows, loading };
}

function AllowedEmailDomainsPage() {
    const canEdit = canManageConfig(useMe());
    const { rows, setRows, loading } = useAdminList(() => api.listAllowedEmailDomains(), canEdit);
    if (!canEdit) return null;
    const domains = rows.map((entry) => entry.domain);
    return (
        <TagListCard
            title="Allowed email domains"
            description={
                domains.length
                    ? 'Only users with an email address from one of these domains can sign in.'
                    : 'No domains are configured. Users from any email domain can sign in.'
            }
            addLabel="Add allowed email domain"
            fieldLabel="Domain"
            placeholder="myorg.com"
            values={domains}
            loading={loading}
            normalize={(text) => text.trim().toLowerCase().replace(/^@/, '')}
            duplicateMessage="That domain is already allowed."
            onAdd={async (domain) => {
                const added = await api.createAllowedEmailDomain({ domain });
                setRows((current) =>
                    [...current, added].sort((a, b) => a.domain.localeCompare(b.domain)),
                );
            }}
            onRemove={async (domain) => {
                await api.deleteAllowedEmailDomain(domain);
                setRows((current) => current.filter((entry) => entry.domain !== domain));
            }}
        />
    );
}

// Everyone listed here gets a copy of every comment and status email.
function EmailCcAddressesCard() {
    const canEdit = canManageConfig(useMe());
    const { rows, setRows, loading } = useAdminList(() => api.listEmailCcAddresses(), canEdit);
    if (!canEdit) return null;
    const emails = rows.map((entry) => entry.email);
    return (
        <TagListCard
            title="Email copies (CC)"
            description={
                emails.length
                    ? 'These addresses get a copy of every comment and status email, in addition to the request owner and participants.'
                    : 'No addresses are configured. Only the request owner and participants get emails.'
            }
            addLabel="Add CC address"
            fieldLabel="Email address"
            placeholder="name@myorg.com"
            values={emails}
            loading={loading}
            normalize={(text) => text.trim().toLowerCase()}
            duplicateMessage="That address already gets a copy."
            onAdd={async (email) => {
                const added = await api.createEmailCcAddress({ email });
                setRows((current) =>
                    [...current, added].sort((a, b) => a.email.localeCompare(b.email)),
                );
            }}
            onRemove={async (email) => {
                await api.deleteEmailCcAddress(email);
                setRows((current) => current.filter((entry) => entry.email !== email));
            }}
        />
    );
}
