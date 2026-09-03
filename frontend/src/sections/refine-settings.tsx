import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';
import {
    Button,
    Card,
    Checkbox,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    PlusOutlined,
    SearchOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import {
    navigateBackToSection,
    navigateToDepartment,
    navigateToInventoryRequest,
    navigateToInventoryType,
    navigateToProgram,
    runOptimisticDashboardUpdate,
    refreshDashboard,
    inventoryRequestUrl,
    programRequestUrl,
} from '../router';
import { DEPARTMENT_QUERY_PARAM, INVENTORY_TYPE_QUERY_PARAM } from '../config';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTime } from '../ui/format';
import { stockLevelTextClass } from '../ui/styles';
import { matchesSearch } from '../ui/search';
import { inventoryTypeQrFilename, inventoryTypeQrLabel } from '../ui/inventory-qr';
import { TableView } from '../ui/table-view';
import { formatInventoryAvailability } from '../ui/inventory-stock';
import { imageUrlForDriveId, prepareInventoryImage } from '../ui/inventory-image';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { UserBlock } from '../ui/user-block';
import { BlockCard } from '../ui/block-card';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { ActionConfirmation } from './refine-app';

type Field = {
    field: string;
    label: string;
    type?: string;
    hiddenInTable?: boolean;
    options?: (dashboard: DashboardPayload) => Array<{ value: string; label: string }>;
    // Only used when adding a new row (never overrides an existing row's value).
    defaultValue?: () => string;
};
type Row = Record<string, any>;

function SettingsDetailFields({ fields }: { fields: Array<[label: string, value: ReactNode]> }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([label, fieldValue]) => (
                <div key={label} className="flex min-w-0 items-baseline gap-2">
                    <dt className="shrink-0 text-xs font-semibold text-black/50">{label}</dt>
                    <dd className="min-w-0 break-words text-sm">{fieldValue}</dd>
                </div>
            ))}
        </div>
    );
}

interface ResourceConfig {
    kind: string;
    title: string;
    addLabel: string;
    emptyMessage: string;
    fields: Field[];
    rows: (dashboard: DashboardPayload) => Row[];
    // Most resources are keyed by a generated Id. Program languages have no
    // Id column — the name itself is the identifier — so this lets the
    // shared table below key/match/save rows without every resource needing
    // one.
    rowKey?: (row: Row) => string;
    create: (values: Record<string, string>) => Promise<unknown>;
    update: (id: string, values: Record<string, string>) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
}

const requestId = () => generateRequestId();
const rowKeyOf = (config: ResourceConfig, row: Row): string =>
    config.rowKey ? config.rowKey(row) : String(row.Id);
const value = (data: FormData, field: Field) => String(data.get(field.field) || '');
const iso = (raw: string) => (raw ? new Date(raw).toISOString() : '');
const RESOURCES: Record<string, ResourceConfig> = {
    departments: {
        kind: 'department',
        title: 'Departments',
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
        addLabel: 'Add place',
        emptyMessage: 'No places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) =>
            [...d.places].sort((a, b) =>
                a.Name.localeCompare(b.Name, undefined, { numeric: true, sensitivity: 'base' }),
            ),
        create: (v) => api.createPlace({ name: v.Name }, requestId()),
        update: (id, v) => api.updatePlace(id, { name: v.Name }, requestId()),
        remove: (id) => api.deletePlace(id, requestId()),
    },
    'inventory-types': {
        kind: 'inventory-type',
        title: 'Inventory types',
        addLabel: 'Add equipment',
        emptyMessage: 'No equipment catalogued yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Description', label: 'Description' },
            {
                field: 'TotalQuantity',
                label: 'Total quantity',
                type: 'number',
                hiddenInTable: true,
            },
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
                options: (d) =>
                    [{ value: '', label: 'All places' }].concat(
                        d.places.map((place) => ({ value: place.Id, label: place.Name })),
                    ),
            },
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
    'shift-types': {
        kind: 'shift-type',
        title: 'Shift types',
        addLabel: 'Add shift type',
        emptyMessage: 'No shift types yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'DefaultStartTime', label: 'Start time', type: 'time' },
            { field: 'DefaultEndTime', label: 'End time', type: 'time' },
            { field: 'Color', label: 'Color', type: 'color' },
        ],
        rows: (d) => d.shiftTypes,
        rowKey: (row) => String(row.Name),
        create: (v) =>
            api.createShiftType(
                {
                    name: v.Name,
                    defaultStartTime: v.DefaultStartTime,
                    defaultEndTime: v.DefaultEndTime,
                    color: v.Color,
                },
                requestId(),
            ),
        update: (name, v) =>
            api.updateShiftType(
                name,
                {
                    name: v.Name,
                    defaultStartTime: v.DefaultStartTime,
                    defaultEndTime: v.DefaultEndTime,
                    color: v.Color,
                },
                requestId(),
            ),
        remove: (name) => api.deleteShiftType(name, requestId()),
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
        rows: (d) => d.programTypes,
        rowKey: (row) => String(row.Name),
        create: (v) => api.createProgramType({ name: v.Name, color: v.Color }, requestId()),
        update: (name, v) =>
            api.updateProgramType(name, { name: v.Name, color: v.Color }, requestId()),
        remove: (name) => api.deleteProgramType(name, requestId()),
    },
    'program-languages': {
        kind: 'program-language',
        title: 'Program languages',
        addLabel: 'Add language',
        emptyMessage: 'No languages configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.programLanguages,
        rowKey: (row) => String(row.Name),
        create: (v) => api.createProgramLanguage({ name: v.Name }, requestId()),
        update: (name, v) => api.updateProgramLanguage(name, { name: v.Name }, requestId()),
        remove: (name) => api.deleteProgramLanguage(name, requestId()),
    },
    'session-types': {
        kind: 'session-type',
        title: 'Session types',
        addLabel: 'Add session type',
        emptyMessage: 'No session types configured yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        rows: (d) => d.sessionTypes,
        rowKey: (row) => String(row.Name),
        create: (v) => api.createSessionType({ name: v.Name }, requestId()),
        update: (name, v) => api.updateSessionType(name, { name: v.Name }, requestId()),
        remove: (name) => api.deleteSessionType(name, requestId()),
    },
};

function formatDateTimeLocalValue(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function todayAt(hours: number, minutes = 0): string {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return formatDateTimeLocalValue(date);
}

function inputValue(field: Field, raw: unknown): string {
    if (field.type !== 'datetime-local') return String(raw ?? '');
    const date = new Date(String(raw || ''));
    if (Number.isNaN(date.getTime())) return String(raw || '').slice(0, 16);
    return formatDateTimeLocalValue(date);
}

function ColorField({ row, field }: { row?: Row; field: Field }) {
    const initialColor = inputValue(field, row?.[field.field]);
    const [color, setColor] = useState(initialColor || '');
    const pickerValue = color || '#ffffff';

    return (
        <Space>
            <input
                className="settings-color-input"
                type="color"
                value={pickerValue}
                onChange={(event) => setColor(event.currentTarget.value)}
                aria-label={color ? `Selected color ${color}` : 'Choose a color'}
            />
            <input type="hidden" name={field.field} value={color} />
            <span className="text-xs opacity-60">{color || 'No color selected'}</span>
            {color && (
                <Button type="link" size="small" onClick={() => setColor('')}>
                    Clear
                </Button>
            )}
        </Space>
    );
}

function SelectField({
    field,
    row,
    dashboard,
}: {
    field: Field;
    row?: Row;
    dashboard: DashboardPayload;
}) {
    const options = field.options?.(dashboard) || [];
    const [selected, setSelected] = useState(String(row?.[field.field] ?? ''));
    return (
        <>
            <input type="hidden" name={field.field} value={selected} />
            <Select
                value={selected}
                onChange={setSelected}
                style={{ width: '100%' }}
                options={options.map((option) => ({ value: option.value, label: option.label }))}
            />
        </>
    );
}

function FieldSet({
    config,
    row,
    dashboard,
    onSubmit,
    submitLabel,
}: {
    config: ResourceConfig;
    row?: Row;
    dashboard: DashboardPayload;
    onSubmit: (values: Record<string, string>) => Promise<void>;
    submitLabel: string;
}) {
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!event.currentTarget.checkValidity()) {
            event.currentTarget.reportValidity();
            return;
        }
        setBusy(true);
        try {
            const data = new FormData(event.currentTarget);
            const values = Object.fromEntries(config.fields.map((f) => [f.field, value(data, f)]));
            await onSubmit(values);
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setBusy(false);
        }
    }
    return (
        <form noValidate onSubmit={submit}>
            {config.fields.map((field, index) => (
                <Form.Item label={field.label} required={index === 0} key={field.field}>
                    {field.type === 'checkbox' ? (
                        <Checkbox name={field.field} defaultChecked={Boolean(row?.[field.field])} />
                    ) : field.type === 'color' ? (
                        <ColorField field={field} row={row} />
                    ) : field.type === 'select' ? (
                        <SelectField field={field} row={row} dashboard={dashboard} />
                    ) : (
                        <Input
                            name={field.field}
                            type={field.type || 'text'}
                            required={index === 0}
                            defaultValue={
                                row
                                    ? inputValue(field, row[field.field])
                                    : (field.defaultValue?.() ?? inputValue(field, undefined))
                            }
                        />
                    )}
                </Form.Item>
            ))}
            <Button type="primary" htmlType="submit" loading={busy}>
                {submitLabel}
            </Button>
        </form>
    );
}

function Editor({
    config,
    row,
    dashboard,
    onClose,
    onSaved,
}: {
    config: ResourceConfig;
    row?: Row;
    dashboard: DashboardPayload;
    onClose: () => void;
    onSaved: (values: Record<string, string>) => Promise<void>;
}) {
    const resourceName = config.addLabel.replace(/^Add /, '');
    return (
        <Modal
            open
            title={row ? `Edit ${resourceName}` : config.addLabel}
            onCancel={onClose}
            footer={null}
            destroyOnHidden>
            <FieldSet
                config={config}
                row={row}
                dashboard={dashboard}
                onSubmit={async (values) => {
                    onClose();
                    await onSaved(values);
                }}
                submitLabel={row ? 'Save' : 'Add'}
            />
        </Modal>
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
    const canEdit = dashboard.me.Role === 'admin';
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const editorOpenRef = useRef(false);
    const pendingRefreshRef = useRef(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const rows = config.rows(dashboard);
    const detailId =
        config.kind === 'department'
            ? new URLSearchParams(window.location.search).get(DEPARTMENT_QUERY_PARAM)
            : config.kind === 'inventory-type'
              ? new URLSearchParams(window.location.search).get(INVENTORY_TYPE_QUERY_PARAM)
              : null;
    const selectedDepartment =
        config.kind === 'department' ? rows.find((row) => row.Id === detailId) || null : null;
    const selectedInventoryType =
        config.kind === 'inventory-type' ? rows.find((row) => row.Id === detailId) || null : null;
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const hasSearch = true;
    const filterSearch =
        config.kind === 'department' || config.kind === 'inventory-type' ? appliedSearch : search;
    const filteredRows = rows.filter((row) => matchesSearch(filterSearch, Object.values(row)));
    const beginCreate = () => {
        editorOpenRef.current = true;
        setCreating(true);
    };
    const beginEdit = (row: Row) => {
        editorOpenRef.current = true;
        setEditing(row);
    };
    const closeEditor = () => {
        editorOpenRef.current = false;
        setCreating(false);
        setEditing(null);
        if (pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            void refreshDashboard().catch(showErrorAlert);
        }
    };
    useEffect(() => {
        if (config.kind !== 'inventory-type' || !selectedInventoryType) {
            setQrCodeUrl('');
            return;
        }
        let active = true;
        void createInventoryTypeQrDataUrl(selectedInventoryType)
            .then((dataUrl) => {
                if (active) setQrCodeUrl(dataUrl);
            })
            .catch((error) => {
                if (active) showErrorAlert(error);
            });
        return () => {
            active = false;
        };
    }, [config.kind, selectedInventoryType?.Id]);
    async function save(values: Record<string, string>) {
        showSavingBadge(true);
        try {
            if (!editing) {
                await config.create(values);
                if (editorOpenRef.current) pendingRefreshRef.current = true;
                else await refreshDashboard();
                return;
            }
            const row = editing;
            await runOptimisticDashboardUpdate(
                (previous) => {
                    const updateRows = (rows: Row[]) =>
                        rows.map((item) =>
                            rowKeyOf(config, item) === rowKeyOf(config, row)
                                ? Object.assign({}, item, values)
                                : item,
                        );
                    if (config.kind === 'department')
                        return Object.assign({}, previous, {
                            departments: updateRows(previous.departments),
                        });
                    if (config.kind === 'place')
                        return Object.assign({}, previous, {
                            places: updateRows(previous.places),
                        });
                    if (config.kind === 'inventory-type')
                        return Object.assign({}, previous, {
                            inventoryTypes: updateRows(previous.inventoryTypes),
                        });
                    if (config.kind === 'block')
                        return Object.assign({}, previous, { blocks: updateRows(previous.blocks) });
                    if (config.kind === 'shift-type')
                        return Object.assign({}, previous, {
                            shiftTypes: updateRows(previous.shiftTypes),
                        });
                    if (config.kind === 'program-type')
                        return Object.assign({}, previous, {
                            programTypes: updateRows(previous.programTypes),
                        });
                    if (config.kind === 'program-language')
                        return Object.assign({}, previous, {
                            programLanguages: updateRows(previous.programLanguages),
                        });
                    return Object.assign({}, previous, {
                        sessionTypes: updateRows(previous.sessionTypes),
                    });
                },
                () => config.update(rowKeyOf(config, row), values),
            );
        } finally {
            showSavingBadge(false);
        }
    }
    async function remove(row: Row) {
        showSavingBadge(true);
        try {
            await runOptimisticDashboardUpdate(
                (previous) => {
                    const filterRows = (rows: Row[]) =>
                        rows.filter((item) => rowKeyOf(config, item) !== rowKeyOf(config, row));
                    if (config.kind === 'department')
                        return Object.assign({}, previous, {
                            departments: filterRows(previous.departments),
                        });
                    if (config.kind === 'place')
                        return Object.assign({}, previous, { places: filterRows(previous.places) });
                    if (config.kind === 'inventory-type')
                        return Object.assign({}, previous, {
                            inventoryTypes: filterRows(previous.inventoryTypes),
                        });
                    if (config.kind === 'block')
                        return Object.assign({}, previous, { blocks: filterRows(previous.blocks) });
                    if (config.kind === 'shift-type')
                        return Object.assign({}, previous, {
                            shiftTypes: filterRows(previous.shiftTypes),
                        });
                    if (config.kind === 'program-type')
                        return Object.assign({}, previous, {
                            programTypes: filterRows(previous.programTypes),
                        });
                    if (config.kind === 'program-language')
                        return Object.assign({}, previous, {
                            programLanguages: filterRows(previous.programLanguages),
                        });
                    return Object.assign({}, previous, {
                        sessionTypes: filterRows(previous.sessionTypes),
                    });
                },
                () => config.remove(rowKeyOf(config, row)),
            );
        } catch (error) {
            showErrorAlert(error);
        } finally {
            showSavingBadge(false);
        }
    }
    async function uploadInventoryTypeImage(row: Row, file: File) {
        showSavingBadge(true);
        try {
            const prepared = await prepareInventoryImage(file);
            const imageId = await api.uploadImage(
                prepared.base64Data,
                `InventoryTypes-${String(row.Id)}.jpg`,
                prepared.mimeType,
                String(row.ImageId || ''),
            );
            await runOptimisticDashboardUpdate(
                (previous) =>
                    Object.assign({}, previous, {
                        inventoryTypes: previous.inventoryTypes.map((item) =>
                            item.Id === row.Id
                                ? Object.assign({}, item, { ImageId: imageId })
                                : item,
                        ),
                    }),
                () =>
                    api.updateInventoryType(
                        row.Id,
                        {
                            name: String(row.Name || ''),
                            description: String(row.Description || ''),
                            requestable: row.Requestable !== false,
                            totalQuantity: Number(row.TotalQuantity || 0),
                            imageId,
                        },
                        requestId(),
                    ),
            );
        } catch (error) {
            showErrorAlert(error);
        } finally {
            showSavingBadge(false);
        }
    }
    async function createInventoryTypeQrDataUrl(row: Row): Promise<string> {
        const QRCode = (await import('qrcode')).default;
        const qrDataUrl = await QRCode.toDataURL(String(row.Id), {
            margin: 2,
            width: 256,
        });
        const image = new Image();
        image.src = qrDataUrl;
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Unable to prepare QR code image.'));
        });
        const label = inventoryTypeQrLabel(String(row.Name || 'Inventory type'));
        const canvas = document.createElement('canvas');
        const labelHeight = 36;
        canvas.width = 256;
        canvas.height = 256 + labelHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to prepare QR code image.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, 256, 256);
        context.fillStyle = '#333333';
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, canvas.width / 2, 256 + labelHeight / 2);
        return canvas.toDataURL('image/png');
    }
    async function downloadInventoryTypeQr(row: Row) {
        try {
            const qrDataUrl = await createInventoryTypeQrDataUrl(row);
            const link = document.createElement('a');
            link.href = qrDataUrl;
            link.download = inventoryTypeQrFilename(row as InventoryTypeDTO);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            showErrorAlert(error);
        }
    }
    const renderActions = (row: Row, detail = false) => (
        <Space
            direction={config.kind === 'department' ? 'vertical' : 'horizontal'}
            size={detail ? 'middle' : 0}>
            {config.kind === 'inventory-type' && !detail && (
                <>
                    <input
                        id={`inventory-type-image-${row.Id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void uploadInventoryTypeImage(row, file);
                        }}
                    />
                    <Button
                        type="text"
                        icon={<UploadOutlined />}
                        onClick={() =>
                            document.getElementById(`inventory-type-image-${row.Id}`)?.click()
                        }
                        aria-label={row.ImageId ? 'Replace photo' : 'Add photo'}
                        title={row.ImageId ? 'Replace photo' : 'Add photo'}
                    />
                </>
            )}
            {config.kind === 'inventory-type' && !detail && (
                <Button
                    type={detail ? 'primary' : 'text'}
                    icon={<DownloadOutlined />}
                    onClick={() => void downloadInventoryTypeQr(row)}
                    aria-label="Download QR code"
                    title="Download QR code"
                />
            )}
            {canEdit && (
                <>
                    <Button
                        type={detail ? 'primary' : 'text'}
                        icon={<EditOutlined />}
                        onClick={() => beginEdit(row)}
                        aria-label="Edit"
                    />
                    <Button
                        type={detail ? 'primary' : 'text'}
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
                    if (field.type === 'select' && field.options) {
                        const options = field.options(dashboard);
                        return (
                            options.find((option) => option.value === String(value ?? ''))?.label ??
                            String(value ?? '')
                        );
                    }
                    return String(value ?? '');
                },
            })),
        ...(config.kind === 'inventory-type'
            ? [
                  {
                      title: 'Available',
                      key: 'available',
                      render: (_: unknown, row: Row) => {
                          const available = Number(row.availableQuantity ?? 0);
                          const total = Number(row.TotalQuantity ?? 0);
                          return (
                              <span className={stockLevelTextClass(available, total)}>
                                  <strong>{formatInventoryAvailability(available, total)}</strong>
                              </span>
                          );
                      },
                  },
              ]
            : []),
        {
            title: 'Actions',
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, row: Row) => renderActions(row),
        },
    ];
    const inventoryTypeCards =
        filteredRows.length > 0 ? (
            <div className="inventory-type-grid">
                {filteredRows.map((row) => {
                    const available = Number(row.availableQuantity ?? 0);
                    const total = Number(row.TotalQuantity ?? 0);
                    const imageUrl = imageUrlForDriveId(String(row.ImageId || ''));
                    return (
                        <BlockCard
                            key={row.Id}
                            className="inventory-type-card"
                            onClick={() => navigateToInventoryType(String(row.Id))}>
                            <div className="inventory-type-card-heading">
                                <strong>{String(row.Name || 'Unnamed equipment')}</strong>
                                {row.Description && (
                                    <span className="inventory-type-card-description">
                                        {String(row.Description)}
                                    </span>
                                )}
                                <span className={stockLevelTextClass(available, total)}>
                                    {formatInventoryAvailability(available, total)}
                                </span>
                            </div>
                            <div className="inventory-type-card-image">
                                {imageUrl ? (
                                    <img src={imageUrl} alt={String(row.Name || '')} />
                                ) : (
                                    <span>No photo</span>
                                )}
                            </div>
                        </BlockCard>
                    );
                })}
            </div>
        ) : (
            <Empty description={config.emptyMessage} />
        );
    const departmentCards =
        filteredRows.length > 0 ? (
            <div className="department-list">
                {filteredRows.map((row) => (
                    <BlockCard
                        key={row.Id}
                        className="department-card"
                        onClick={() => navigateToDepartment(String(row.Id))}>
                        <div className="department-card-content">
                            <strong>
                                {String(row.Name || 'Unnamed department')}
                                {row.ShortName ? ` (${String(row.ShortName)})` : ''}
                            </strong>
                            <span>{String(row.LeadEmail || 'No lead email')}</span>
                        </div>
                    </BlockCard>
                ))}
            </div>
        ) : (
            <Empty description={config.emptyMessage} />
        );
    const departmentHeader = (
        <div className="antd-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>{config.title}</Typography.Title>
            </div>
            <Space className="antd-board-filters" wrap>
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder={`Search ${config.title.toLowerCase()}`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={() => setAppliedSearch(search)}
                    aria-label={`Search ${config.title.toLowerCase()}`}
                    title={`Search ${config.title.toLowerCase()}`}
                />
            </Space>
            {canEdit && (
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={beginCreate}
                    aria-label={`Add ${config.kind}`}
                    title={`Add ${config.kind}`}
                />
            )}
        </div>
    );
    const inventoryTypeDetail = selectedInventoryType && (
        <>
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>
                        {String(selectedInventoryType.Name || 'Unnamed equipment')}
                    </Typography.Title>
                </div>
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigateBackToSection('inventory-types')}
                        aria-label="Back to inventory types"
                        title="Back to inventory types"
                    />
                    {renderActions(selectedInventoryType, true)}
                </Space>
            </div>
            <DetailSections>
                <DetailSection title="Details">
                    <SettingsDetailFields
                        fields={[
                            ['Name', String(selectedInventoryType.Name || 'Unnamed equipment')],
                            ['Description', String(selectedInventoryType.Description || '—')],
                            [
                                'Availability',
                                formatInventoryAvailability(
                                    Number(selectedInventoryType.availableQuantity ?? 0),
                                    Number(selectedInventoryType.TotalQuantity ?? 0),
                                ),
                            ],
                            ['Total quantity', String(selectedInventoryType.TotalQuantity ?? 0)],
                            [
                                'Requestable',
                                selectedInventoryType.Requestable !== false ? 'Yes' : 'No',
                            ],
                        ]}
                    />
                </DetailSection>
                <DetailSection
                    title="Image"
                    action={
                        canEdit ? (
                            <>
                                <input
                                    id={`inventory-type-image-${selectedInventoryType.Id}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (file)
                                            void uploadInventoryTypeImage(
                                                selectedInventoryType,
                                                file,
                                            );
                                    }}
                                />
                                <Button
                                    type="primary"
                                    icon={<UploadOutlined />}
                                    onClick={() =>
                                        document
                                            .getElementById(
                                                `inventory-type-image-${selectedInventoryType.Id}`,
                                            )
                                            ?.click()
                                    }
                                    aria-label={
                                        selectedInventoryType.ImageId
                                            ? 'Replace photo'
                                            : 'Add photo'
                                    }
                                    title={
                                        selectedInventoryType.ImageId
                                            ? 'Replace photo'
                                            : 'Add photo'
                                    }
                                />
                            </>
                        ) : null
                    }>
                    <div className="inventory-type-detail-image">
                        {imageUrlForDriveId(String(selectedInventoryType.ImageId || '')) ? (
                            <img
                                src={imageUrlForDriveId(
                                    String(selectedInventoryType.ImageId || ''),
                                )}
                                alt={String(selectedInventoryType.Name || '')}
                            />
                        ) : (
                            <span>No photo</span>
                        )}
                    </div>
                </DetailSection>
                <DetailSection
                    title="QR code"
                    action={
                        <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            onClick={() => void downloadInventoryTypeQr(selectedInventoryType)}
                            aria-label="Download QR code"
                            title="Download QR code"
                        />
                    }>
                    <div className="flex justify-center">
                        {qrCodeUrl ? (
                            <img
                                src={qrCodeUrl}
                                alt={`QR code for ${String(selectedInventoryType.Name || 'inventory type')}`}
                                width={256}
                                height={256}
                            />
                        ) : (
                            <Typography.Text type="secondary">Preparing QR code…</Typography.Text>
                        )}
                    </div>
                </DetailSection>
                <DetailSection span="full">
                    <RelatedRequestBlocks
                        title="Inventory requests"
                        kind="inventory"
                        items={dashboard.inventoryRequests.filter((request) =>
                            request.items.some(
                                (item) => item.InventoryTypeId === selectedInventoryType.Id,
                            ),
                        )}
                        dashboard={dashboard}
                        emptyMessage="No inventory requests have used this equipment."
                        hrefFor={inventoryRequestUrl}
                        onOpen={navigateToInventoryRequest}
                    />
                </DetailSection>
            </DetailSections>
        </>
    );
    const departmentUsers = selectedDepartment
        ? dashboard.users.filter((user) => user.DepartmentId === selectedDepartment.Id)
        : [];
    const departmentPrograms = selectedDepartment
        ? dashboard.programRequests.filter(
              (request) => request.DepartmentId === selectedDepartment.Id,
          )
        : [];
    const departmentInventoryRequests = selectedDepartment
        ? dashboard.inventoryRequests.filter(
              (request) => request.DepartmentId === selectedDepartment.Id,
          )
        : [];
    const departmentDetail = selectedDepartment && (
        <>
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>
                        {String(selectedDepartment.Name || 'Unnamed department')}
                        {selectedDepartment.ShortName
                            ? ` (${String(selectedDepartment.ShortName)})`
                            : ''}
                    </Typography.Title>
                </div>
                <Space>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigateBackToSection('departments')}
                        aria-label="Back to departments"
                        title="Back to departments"
                    />
                    {canEdit && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeleting(selectedDepartment)}
                            aria-label="Delete department"
                            title="Delete department"
                        />
                    )}
                </Space>
            </div>
            <DetailSections>
                <DetailSection
                    title="Details"
                    action={
                        canEdit ? (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => beginEdit(selectedDepartment)}
                                aria-label="Edit department"
                                title="Edit department"
                            />
                        ) : null
                    }>
                    <SettingsDetailFields
                        fields={[
                            ['Name', String(selectedDepartment.Name || 'Unnamed department')],
                            ['Short name', String(selectedDepartment.ShortName || '—')],
                            ['Lead email', String(selectedDepartment.LeadEmail || '—')],
                        ]}
                    />
                </DetailSection>
                <DetailSection span="full">
                    <Typography.Title level={3}>
                        Users <Tag>{departmentUsers.length}</Tag>
                    </Typography.Title>
                    {departmentUsers.length ? (
                        <div className="department-related-grid">
                            {departmentUsers.map((user) => (
                                <UserBlock key={user.Email} user={user} dashboard={dashboard} />
                            ))}
                        </div>
                    ) : (
                        <Empty description="No users in this department." />
                    )}
                </DetailSection>
                <DetailSection span="full">
                    <RelatedRequestBlocks
                        title="Programs"
                        kind="program"
                        items={departmentPrograms}
                        dashboard={dashboard}
                        emptyMessage="No program requests for this department."
                        hrefFor={programRequestUrl}
                        onOpen={navigateToProgram}
                    />
                </DetailSection>
                <DetailSection span="full">
                    <RelatedRequestBlocks
                        title="Inventory requests"
                        kind="inventory"
                        items={departmentInventoryRequests}
                        dashboard={dashboard}
                        emptyMessage="No inventory requests for this department."
                        hrefFor={inventoryRequestUrl}
                        onOpen={navigateToInventoryRequest}
                    />
                </DetailSection>
            </DetailSections>
        </>
    );
    return (
        <section
            className={`${compact ? 'antd-settings-compact' : 'antd-page'}${
                config.kind === 'block' ? ' blocks-page' : ''
            }`}>
            {config.kind === 'department' && selectedDepartment ? (
                departmentDetail
            ) : config.kind === 'inventory-type' && selectedInventoryType ? (
                inventoryTypeDetail
            ) : config.kind === 'department' || config.kind === 'inventory-type' ? (
                <>
                    {departmentHeader}
                    {config.kind === 'department' ? departmentCards : inventoryTypeCards}
                </>
            ) : (
                <>
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
                </>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Delete “${deleting[config.fields[0].field]}”?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        const row = deleting;
                        setDeleting(null);
                        if (config.kind === 'department') navigateBackToSection('departments');
                        if (config.kind === 'inventory-type')
                            navigateBackToSection('inventory-types');
                        await remove(row);
                    }}
                />
            )}
            {canEdit && (creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    dashboard={dashboard}
                    onClose={closeEditor}
                    onSaved={save}
                />
            )}
        </section>
    );
}

function HomeContentPage({ dashboard }: { dashboard: DashboardPayload }) {
    const [savingGuidelines, setSavingGuidelines] = useState(false);
    const canEdit = dashboard.me.Role === 'admin';

    async function saveGuidelines(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSavingGuidelines(true);
        const data = new FormData(event.currentTarget);
        const guidelines = String(data.get('guidelines') || '');
        void runOptimisticDashboardUpdate(
            (previous) => Object.assign({}, previous, { homeContent: { Guidelines: guidelines } }),
            () => api.updateHomeContent({ guidelines }),
        ).catch(showErrorAlert);
        setSavingGuidelines(false);
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
            {(['shift-types', 'program-types', 'program-languages', 'session-types'] as const).map(
                (key) => (
                    <SettingsResourcePage
                        key={key}
                        config={RESOURCES[key]}
                        dashboard={dashboard}
                        compact
                    />
                ),
            )}
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
