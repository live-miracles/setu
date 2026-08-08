import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { renderEmptyState } from '../ui/components';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { escapeHtml, formatDateTime } from '../ui/format';
import { icon as iconMarkup, type IconName } from '../ui/icons';
import { stockLevelClass } from '../ui/styles';

type Field = { field: string; label: string; type?: string };
type Row = Record<string, any>;

interface ResourceConfig {
    kind: string;
    title: string;
    subtitle: string;
    addLabel: string;
    emptyMessage: string;
    fields: Field[];
    rows: (dashboard: DashboardPayload) => Row[];
    create: (values: Record<string, string>) => Promise<unknown>;
    update: (id: string, values: Record<string, string>) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    accessory?: (row: Row) => string;
}

const requestId = () => generateRequestId();
const value = (data: FormData, field: Field) => String(data.get(field.field) || '');
const iso = (raw: string) => (raw ? new Date(raw).toISOString() : '');
const icon = (name: IconName, className = 'size-5') => (
    <span
        className="inline-flex"
        dangerouslySetInnerHTML={{ __html: iconMarkup(name, className) }}
    />
);

const RESOURCES: Record<string, ResourceConfig> = {
    departments: {
        kind: 'department',
        title: 'Departments',
        subtitle: 'Teams people can belong to.',
        addLabel: 'Add department',
        emptyMessage: 'No departments yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'ShortName', label: 'Short name' },
            { field: 'LeadEmail', label: 'Lead email', type: 'email' },
        ],
        rows: (d) => d.departments,
        create: (v) =>
            api.createDepartment(
                { name: v.Name, shortName: v.ShortName, leadEmail: v.LeadEmail },
                requestId(),
            ),
        update: (id, v) =>
            api.updateDepartment(
                id,
                { name: v.Name, shortName: v.ShortName, leadEmail: v.LeadEmail },
                requestId(),
            ),
        remove: (id) => api.deleteDepartment(id, requestId()),
    },
    places: {
        kind: 'place',
        title: 'Places',
        subtitle: 'Studios and rooms a program can be booked into.',
        addLabel: 'Add place',
        emptyMessage: 'No places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.places,
        create: (v) => api.createPlace({ name: v.Name }, requestId()),
        update: (id, v) => api.updatePlace(id, { name: v.Name }, requestId()),
        remove: (id) => api.deletePlace(id, requestId()),
    },
    'inventory-types': {
        kind: 'inventory-type',
        title: 'Inventory types',
        subtitle: 'The equipment catalogue people request from.',
        addLabel: 'Add equipment',
        emptyMessage: 'No equipment catalogued yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Description', label: 'Description' },
            { field: 'TotalQuantity', label: 'Total quantity', type: 'number' },
        ],
        rows: (d) => d.inventoryTypes,
        create: (v) =>
            api.createInventoryType(
                {
                    name: v.Name,
                    description: v.Description,
                    requestable: true,
                    totalQuantity: Number(v.TotalQuantity || 0),
                },
                requestId(),
            ),
        update: (id, v) =>
            api.updateInventoryType(
                id,
                {
                    name: v.Name,
                    description: v.Description,
                    requestable: true,
                    totalQuantity: Number(v.TotalQuantity || 0),
                },
                requestId(),
            ),
        remove: (id) => api.deleteInventoryType(id, requestId()),
        accessory: (row) => {
            const s = stockLevelClass(
                Number(row.availableQuantity || 0),
                Number(row.TotalQuantity || 0),
            );
            return `<span class="text-xs ${s.text}">Available <strong>${row.availableQuantity || 0}/${row.TotalQuantity || 0}</strong></span>`;
        },
    },
    blocks: {
        kind: 'block',
        title: 'Blocks',
        subtitle: 'Times unavailable for normal program requests.',
        addLabel: 'Add block',
        emptyMessage: 'No blocked times configured yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'StartDateTime', label: 'Start', type: 'datetime-local' },
            { field: 'EndDateTime', label: 'End', type: 'datetime-local' },
            { field: 'Place', label: 'Place (optional)' },
        ],
        rows: (d) => d.blocks,
        create: (v) =>
            api.createBlock(
                {
                    name: v.Name,
                    startDateTime: iso(v.StartDateTime),
                    endDateTime: iso(v.EndDateTime),
                    place: v.Place,
                },
                requestId(),
            ),
        update: (id, v) =>
            api.updateBlock(
                id,
                {
                    name: v.Name,
                    startDateTime: iso(v.StartDateTime),
                    endDateTime: iso(v.EndDateTime),
                    place: v.Place,
                },
                requestId(),
            ),
        remove: (id) => api.deleteBlock(id, requestId()),
    },
    'shift-presets': {
        kind: 'shift-preset',
        title: 'Shift presets',
        subtitle: 'Default times used when scheduling a roster shift.',
        addLabel: 'Add shift preset',
        emptyMessage: 'No shift presets yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'DefaultStartTime', label: 'Start time', type: 'time' },
            { field: 'DefaultEndTime', label: 'End time', type: 'time' },
        ],
        rows: (d) => d.shiftPresets,
        create: (v) =>
            api.createShiftPreset(
                {
                    name: v.Name,
                    defaultStartTime: v.DefaultStartTime,
                    defaultEndTime: v.DefaultEndTime,
                },
                requestId(),
            ),
        update: (id, v) =>
            api.updateShiftPreset(
                id,
                {
                    name: v.Name,
                    defaultStartTime: v.DefaultStartTime,
                    defaultEndTime: v.DefaultEndTime,
                },
                requestId(),
            ),
        remove: (id) => api.deleteShiftPreset(id, requestId()),
    },
    'program-types': {
        kind: 'program-type',
        title: 'Program types',
        subtitle: 'Options available when creating a program request.',
        addLabel: 'Add program type',
        emptyMessage: 'No program types configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.programTypes,
        create: (v) => api.createProgramType({ name: v.Name }, requestId()),
        update: (id, v) => api.updateProgramType(id, { name: v.Name }, requestId()),
        remove: (id) => api.deleteProgramType(id, requestId()),
    },
    'program-languages': {
        kind: 'program-language',
        title: 'Program languages',
        subtitle: 'Languages available for program requests.',
        addLabel: 'Add language',
        emptyMessage: 'No languages configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.programLanguages,
        create: (v) => api.createProgramLanguage({ name: v.Name }, requestId()),
        update: (id, v) => api.updateProgramLanguage(id, { name: v.Name }, requestId()),
        remove: (id) => api.deleteProgramLanguage(id, requestId()),
    },
    'session-types': {
        kind: 'session-type',
        title: 'Session types',
        subtitle: 'Session formats available inside a program request.',
        addLabel: 'Add session type',
        emptyMessage: 'No session types configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.sessionTypes,
        create: (v) => api.createSessionType({ name: v.Name }, requestId()),
        update: (id, v) => api.updateSessionType(id, { name: v.Name }, requestId()),
        remove: (id) => api.deleteSessionType(id, requestId()),
    },
};

function inputValue(field: Field, raw: unknown): string {
    if (field.type !== 'datetime-local') return String(raw ?? '');
    const date = new Date(String(raw || ''));
    if (Number.isNaN(date.getTime())) return String(raw || '').slice(0, 16);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function FieldSet({
    config,
    row,
    onSubmit,
    submitLabel,
}: {
    config: ResourceConfig;
    row?: Row;
    onSubmit: (values: Record<string, string>) => Promise<void>;
    submitLabel: string;
}) {
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        try {
            const data = new FormData(event.currentTarget);
            await onSubmit(Object.fromEntries(config.fields.map((f) => [f.field, value(data, f)])));
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setBusy(false);
        }
    }
    return (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            {config.fields.map((field, index) => (
                <label className="fieldset" key={field.field}>
                    <span className="label">{field.label}</span>
                    <input
                        name={field.field}
                        type={field.type || 'text'}
                        required={index === 0}
                        defaultValue={inputValue(field, row?.[field.field])}
                        className="input w-full"
                    />
                </label>
            ))}
            <div className="modal-action sm:col-span-2">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy && <span className="loading loading-spinner loading-xs" />}
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}

function Editor({
    config,
    row,
    onClose,
    onSaved,
}: {
    config: ResourceConfig;
    row?: Row;
    onClose: () => void;
    onSaved: (values: Record<string, string>) => Promise<void>;
}) {
    return (
        <dialog open className="modal" onCancel={onClose}>
            <div className="modal-box w-11/12 max-w-[50rem]">
                <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
                    {icon(row ? 'edit' : 'plus', 'size-5 text-primary')}
                    {row ? 'Edit' : config.addLabel}
                </h3>
                <FieldSet
                    config={config}
                    row={row}
                    onSubmit={async (values) => {
                        await onSaved(values);
                        onClose();
                    }}
                    submitLabel={row ? 'Save' : 'Add'}
                />
                <button
                    type="button"
                    className="btn btn-ghost absolute right-3 top-3"
                    onClick={onClose}
                    aria-label="Close">
                    ×
                </button>
            </div>
            <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
        </dialog>
    );
}

function SettingsResourcePage({
    config,
    dashboard,
    compact = false,
}: {
    config: ResourceConfig;
    dashboard: DashboardPayload;
    compact?: boolean;
}) {
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const rows = config.rows(dashboard);
    async function save(values: Record<string, string>) {
        showSavingBadge(true);
        try {
            await (editing ? config.update(editing.Id, values) : config.create(values));
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
        }
    }
    async function remove(row: Row) {
        if (!window.confirm(`Delete “${row[config.fields[0].field]}”?`)) return;
        showSavingBadge(true);
        try {
            await config.remove(row.Id);
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            showSavingBadge(false);
        }
    }
    return (
        <section className={compact ? 'space-y-3' : 'space-y-5'}>
            {!compact && (
                <header className="section-heading">
                    <div>
                        <h1>{config.title}</h1>
                        <p>{config.subtitle}</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                        {icon('plus', 'size-4')}
                        {config.addLabel}
                    </button>
                </header>
            )}
            <div className="card border border-base-300 bg-base-100">
                <div className="card-body gap-2">
                    <div className="flex items-center justify-between">
                        <h2 className="card-title text-base">{config.title}</h2>
                        <div className="flex items-center gap-2">
                            <span className="badge badge-ghost badge-sm">{rows.length}</span>
                            {compact && (
                                <button
                                    className="btn btn-primary btn-xs"
                                    onClick={() => setCreating(true)}>
                                    {icon('plus', 'size-3')}Add
                                </button>
                            )}
                        </div>
                    </div>
                    {rows.length ? (
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        {config.fields.map((f) => (
                                            <th key={f.field}>{f.label}</th>
                                        ))}
                                        <th className="w-24" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.Id}>
                                            <td className="font-medium">
                                                {escapeHtml(
                                                    String(row[config.fields[0].field] ?? ''),
                                                )}
                                            </td>
                                            {config.fields.slice(1).map((field) => (
                                                <td key={field.field}>
                                                    {field.type === 'datetime-local'
                                                        ? formatDateTime(
                                                              String(row[field.field] || ''),
                                                          )
                                                        : escapeHtml(
                                                              String(row[field.field] ?? ''),
                                                          )}
                                                </td>
                                            ))}
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        onClick={() => setEditing(row)}
                                                        aria-label="Edit">
                                                        {icon('edit', 'size-4')}
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-xs text-error"
                                                        onClick={() => remove(row)}
                                                        aria-label="Delete">
                                                        {icon('trash', 'size-4')}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div
                            dangerouslySetInnerHTML={{
                                __html: renderEmptyState('box', config.emptyMessage),
                            }}
                        />
                    )}
                </div>
            </div>
            {(creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    onSaved={save}
                />
            )}
        </section>
    );
}

function HomeContentPage({ dashboard }: { dashboard: DashboardPayload }) {
    const [saving, setSaving] = useState(false);
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const data = new FormData(event.currentTarget);
            await api.updateHomeContent({
                guidelines: String(data.get('guidelines') || ''),
                notificationEmail: String(data.get('notificationEmail') || ''),
            });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setSaving(false);
        }
    }
    return (
        <section className="space-y-5">
            <header className="section-heading">
                <div>
                    <h1>Other settings</h1>
                    <p>Guidelines and reusable options used throughout the app.</p>
                </div>
            </header>
            <div className="card border border-base-300 bg-base-100">
                <div className="card-body">
                    <form className="grid gap-3" onSubmit={save}>
                        <label className="fieldset">
                            <span className="label">Guidelines</span>
                            <textarea
                                name="guidelines"
                                className="textarea w-full"
                                defaultValue={dashboard.homeContent.Guidelines}
                            />
                        </label>
                        <label className="fieldset max-w-md">
                            <span className="label">Notification email</span>
                            <input
                                name="notificationEmail"
                                type="email"
                                className="input w-full"
                                defaultValue={dashboard.homeContent.NotificationEmail}
                            />
                        </label>
                        <button className="btn btn-primary w-fit" disabled={saving}>
                            {saving && <span className="loading loading-spinner loading-xs" />}Save
                        </button>
                    </form>
                </div>
            </div>
            {(
                ['shift-presets', 'program-types', 'program-languages', 'session-types'] as const
            ).map((key) => (
                <SettingsResourcePage
                    key={key}
                    config={RESOURCES[key]}
                    dashboard={dashboard}
                    compact
                />
            ))}
        </section>
    );
}

export function renderRefineSettings(
    key: string,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    if (key === 'home-content') {
        mountRefinePage(container, <HomeContentPage dashboard={dashboard} />, key);
        return;
    }
    const config = RESOURCES[key];
    if (!config) throw new Error(`Unknown settings resource: ${key}`);
    mountRefinePage(container, <SettingsResourcePage config={config} dashboard={dashboard} />, key);
}
