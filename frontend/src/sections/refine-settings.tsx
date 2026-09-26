import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useCreate, useDelete, useInvalidate, useList, useUpdate } from '@refinedev/core';
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
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { useDashboard } from '../dashboard-context';
import {
    departmentPath,
    departmentsPath,
    inventoryRequestPath,
    inventoryTypePath,
    inventoryTypesPath,
    programRequestPath,
} from '../paths';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTime } from '../ui/format';
import { formatDateTimeLocal } from '../ui/date';
import { stockLevelTextClass } from '../ui/styles';
import { matchesSearch } from '../ui/search';
import {
    inventoryLabelQrFilename,
    inventoryTypeDisplayName,
    inventoryQrValue,
    inventoryTypeQrPrintLabel,
    inventoryTypeQrFilename,
} from '../ui/inventory-qr';
import { TableView } from '../ui/table-view';
import { formatInventoryAvailability } from '../ui/inventory-stock';
import { prepareInventoryImage } from '../ui/inventory-image';
import { IMAGE_BUCKET, IMAGE_CACHE_CONTROL } from '../ui/image-storage';
import { supabase } from '../supabase';
import { RequestImage } from '../ui/request-image';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { UserBlock } from '../ui/user-block';
import { BlockCard } from '../ui/block-card';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { ActionConfirmation, SaveFooter, TextField } from './refine-shared';

type Field = {
    field: string;
    label: string;
    type?: string;
    datalistId?: string;
    hiddenInTable?: boolean;
    // Names another RESOURCES entry (and refine-data-provider.ts resource)
    // whose rows populate this select — resolved via its own useList rather
    // than the shared dashboard blob. optionsLabel adds a blank/"All ..."
    // entry ahead of the fetched rows when set.
    optionsResource?: string;
    optionsLabel?: string;
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
    // Most resources are keyed by a generated Id. Program languages have no
    // Id column — the name itself is the identifier — so this lets the
    // shared table below key/match/save rows without every resource needing
    // one.
    rowKey?: (row: Row) => string;
    // Postgres's `order by name` isn't locale/numeric-aware (e.g. "Room 10"
    // would sort before "Room 2") — resources that need that go through this
    // instead of relying on the backend's ordering.
    sortRows?: (rows: Row[]) => Row[];
    toInput: (values: Record<string, string>) => Record<string, unknown>;
}

const rowKeyOf = (config: ResourceConfig, row: Row): string =>
    config.rowKey ? config.rowKey(row) : String(row.Id);
const value = (data: FormData, field: Field) => String(data.get(field.field) || '');
const iso = (raw: string) => (raw ? new Date(raw).toISOString() : '');
// Every settings resource's create/update payload has the same shape (see
// refine-data-provider.ts, which does the actual api.ts call + dedupe id) —
// this only translates the form's uppercase field names (matching
// fields[].field) into the lowercase CreateXInput/UpdateXInput shape.
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
        toInput: (v) => ({ name: v.Name, shortName: v.ShortName, leadEmail: v.LeadEmail }),
    },
    places: {
        kind: 'place',
        title: 'Places',
        addLabel: 'Add place',
        emptyMessage: 'No places yet.',
        fields: [{ field: 'Name', label: 'Name' }],
        sortRows: (rows) =>
            [...rows].sort((a, b) =>
                String(a.Name).localeCompare(String(b.Name), undefined, {
                    numeric: true,
                    sensitivity: 'base',
                }),
            ),
        toInput: (v) => ({ name: v.Name }),
    },
    'inventory-types': {
        kind: 'inventory-type',
        title: 'Inventory types',
        addLabel: 'Add equipment',
        emptyMessage: 'No equipment catalogued yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Brand', label: 'Brand', datalistId: 'inventory-brand-options' },
            { field: 'Model', label: 'Model' },
            { field: 'Location', label: 'Location' },
            { field: 'Description', label: 'Description', hiddenInTable: true },
            {
                field: 'TotalQuantity',
                label: 'Total quantity',
                type: 'number',
                hiddenInTable: true,
            },
            {
                field: 'Requestable',
                label: 'Requestable',
                type: 'checkbox',
                hiddenInTable: true,
            },
        ],
        sortRows: (rows) =>
            [...rows].sort((a, b) => {
                const brandCompare = String(a.Brand || '').localeCompare(
                    String(b.Brand || ''),
                    undefined,
                    { numeric: true, sensitivity: 'base' },
                );
                if (brandCompare !== 0) return brandCompare;
                return String(a.Name || '').localeCompare(String(b.Name || ''), undefined, {
                    numeric: true,
                    sensitivity: 'base',
                });
            }),
        toInput: (v) => ({
            brand: v.Brand,
            name: v.Name,
            model: v.Model,
            location: v.Location,
            description: v.Description,
            requestable: v.Requestable === 'on',
            totalQuantity: Number(v.TotalQuantity || 0),
        }),
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

function inputValue(field: Field, raw: unknown): string {
    if (field.type !== 'datetime-local') return String(raw ?? '');
    const date = new Date(String(raw || ''));
    if (Number.isNaN(date.getTime())) return String(raw || '').slice(0, 16);
    return formatDateTimeLocal(date);
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

function SelectField({ field, row }: { field: Field; row?: Row }) {
    const { result } = useList({
        resource: field.optionsResource || '',
        pagination: { mode: 'off' },
    });
    const options = [
        ...(field.optionsLabel ? [{ value: '', label: field.optionsLabel }] : []),
        ...(result.data as Row[]).map((option) => ({
            value: String(option.Id ?? option.Name ?? ''),
            label: String(option.Name ?? option.Id ?? ''),
        })),
    ];
    const [selected, setSelected] = useState(String(row?.[field.field] ?? ''));
    return (
        <>
            <input type="hidden" name={field.field} value={selected} />
            <Select
                value={selected}
                onChange={setSelected}
                className="antd-full-width"
                options={options.map((option) => ({ value: option.value, label: option.label }))}
            />
        </>
    );
}

function FieldSet({
    config,
    row,
    onSubmit,
    submitLabel,
    datalistOptions = {},
}: {
    config: ResourceConfig;
    row?: Row;
    onSubmit: (values: Record<string, string>) => Promise<void>;
    submitLabel: string;
    datalistOptions?: Record<string, string[]>;
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
            {config.fields.map((field, index) => {
                const defaultValue = row
                    ? inputValue(field, row[field.field])
                    : (field.defaultValue?.() ?? inputValue(field, undefined));
                if (!['checkbox', 'color', 'select'].includes(field.type || '')) {
                    return (
                        <span key={field.field}>
                            <TextField
                                name={field.field}
                                label={field.label}
                                type={field.type || 'text'}
                                list={field.datalistId}
                                required={index === 0}
                                value={defaultValue}
                            />
                            {field.datalistId && (
                                <datalist id={field.datalistId}>
                                    {(datalistOptions[field.datalistId] || []).map((option) => (
                                        <option key={option} value={option} />
                                    ))}
                                </datalist>
                            )}
                        </span>
                    );
                }
                return (
                    <Form.Item label={field.label} required={index === 0} key={field.field}>
                        {field.type === 'checkbox' ? (
                            <Checkbox
                                name={field.field}
                                defaultChecked={row ? row[field.field] !== false : true}
                            />
                        ) : field.type === 'color' ? (
                            <ColorField field={field} row={row} />
                        ) : (
                            <SelectField field={field} row={row} />
                        )}
                    </Form.Item>
                );
            })}
            <Button type="primary" htmlType="submit" loading={busy}>
                {submitLabel}
            </Button>
        </form>
    );
}

function Editor({
    config,
    row,
    onClose,
    onSaved,
    datalistOptions,
}: {
    config: ResourceConfig;
    row?: Row;
    onClose: () => void;
    onSaved: (values: Record<string, string>) => Promise<void>;
    datalistOptions?: Record<string, string[]>;
}) {
    const resourceLabel = config.addLabel.replace(/^Add /, '');
    return (
        <Modal
            open
            title={row ? `Edit ${resourceLabel}` : config.addLabel}
            onCancel={onClose}
            footer={null}
            destroyOnHidden>
            <FieldSet
                config={config}
                row={row}
                onSubmit={async (values) => {
                    onClose();
                    await onSaved(values);
                }}
                datalistOptions={datalistOptions}
                submitLabel={row ? 'Save' : 'Add'}
            />
        </Modal>
    );
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
    const navigate = useNavigate();
    const { refreshDashboard } = useDashboard();
    const { id: detailId = null } = useParams<{ id: string }>();
    const config = RESOURCES[resourceName];
    if (!config) throw new Error(`Unknown settings resource: ${resourceName}`);
    const canEdit = dashboard.me.Role === 'admin';
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result, query } = useList({ resource: resourceName, pagination: { mode: 'off' } });
    const resourceLoading = query.isLoading;
    const rawRows = result.data as Row[];
    const rows = config.sortRows ? config.sortRows(rawRows) : rawRows;
    const inventoryBrandOptions =
        config.kind === 'inventory-type'
            ? Array.from(
                  new Set(rows.map((row) => String(row.Brand || '').trim()).filter(Boolean)),
              ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            : [];
    const { mutateAsync: createRow } = useCreate();
    const { mutateAsync: updateRow } = useUpdate();
    const { mutateAsync: deleteRow } = useDelete();
    const invalidate = useInvalidate();
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
    const selectedDepartment =
        config.kind === 'department' ? rows.find((row) => row.Id === detailId) || null : null;
    const selectedInventoryType =
        config.kind === 'inventory-type' ? rows.find((row) => row.Id === detailId) || null : null;
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [selectedQrLabelId, setSelectedQrLabelId] = useState('');
    const [labelEditorOpen, setLabelEditorOpen] = useState(false);
    const [labelEditor, setLabelEditor] = useState<InventoryLabel | null>(null);
    const [labelEditorName, setLabelEditorName] = useState('');
    const [labelBusy, setLabelBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const hasSearch = true;
    const filterSearch =
        config.kind === 'department' || config.kind === 'inventory-type' ? appliedSearch : search;
    const filteredRows = rows.filter((row) => matchesSearch(filterSearch, Object.values(row)));
    const beginCreate = () => setCreating(true);
    const beginEdit = (row: Row) => setEditing(row);
    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };
    useEffect(() => {
        if (config.kind !== 'inventory-type' || !selectedInventoryType) {
            setQrCodeUrl('');
            setSelectedQrLabelId('');
            return;
        }
        setSelectedQrLabelId('');
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
            const mutateOptions = { successNotification: false, errorNotification: false } as const;
            const payload = config.toInput(values);
            if (!editing) {
                const created = await createRow({
                    resource: resourceName,
                    values: payload,
                    ...mutateOptions,
                });
                if (config.kind === 'inventory-type') {
                    navigate(inventoryTypePath(rowKeyOf(config, created.data as Row)), {
                        replace: true,
                    });
                }
            } else {
                await updateRow({
                    resource: resourceName,
                    id: rowKeyOf(config, editing),
                    values: payload,
                    ...mutateOptions,
                });
            }
            // Refine's own query cache already refetches this page's list on
            // success; refreshDashboard also keeps the shared dashboard blob
            // in sync for pages that still cross-reference this resource
            // from there (e.g. a department/place picker) and haven't been
            // migrated to Refine's hooks yet.
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
        }
    }
    async function remove(row: Row): Promise<boolean> {
        showSavingBadge(true);
        try {
            await deleteRow({
                resource: resourceName,
                id: rowKeyOf(config, row),
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
            return true;
        } catch (error) {
            showErrorAlert(error);
            return false;
        } finally {
            showSavingBadge(false);
        }
    }
    async function uploadInventoryTypeImage(row: Row, file: File) {
        showSavingBadge(true);
        try {
            const prepared = await prepareInventoryImage(file);
            const upload = await api.createImageUploadUrl(
                `InventoryTypes-${String(row.Id)}.jpg`,
                prepared.mimeType,
            );
            const { error: uploadError } = await supabase()
                .storage.from(IMAGE_BUCKET)
                .uploadToSignedUrl(upload.path, upload.token, prepared.blob, {
                    cacheControl: IMAGE_CACHE_CONTROL,
                    contentType: prepared.mimeType,
                });
            if (uploadError) throw uploadError;
            const imageId = upload.path;
            await updateRow({
                resource: resourceName,
                id: row.Id,
                values: {
                    brand: String(row.Brand || ''),
                    name: String(row.Name || ''),
                    model: String(row.Model || ''),
                    location: String(row.Location || ''),
                    description: String(row.Description || ''),
                    requestable: row.Requestable !== false,
                    totalQuantity: Number(row.TotalQuantity || 0),
                    imageId,
                },
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            showSavingBadge(false);
        }
    }
    async function createInventoryTypeQrDataUrl(row: Row, label?: InventoryLabel): Promise<string> {
        const QRCode = (await import('qrcode')).default;
        const qrDataUrl = await QRCode.toDataURL(inventoryQrValue(row as InventoryTypeDTO, label), {
            margin: 2,
            width: 256,
        });
        const image = new Image();
        image.src = qrDataUrl;
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Unable to prepare QR code image.'));
        });
        const displayLabel = inventoryTypeQrPrintLabel(row as InventoryTypeDTO, label);
        const canvas = document.createElement('canvas');
        const labelPadding = 12;
        const lineHeight = 30;
        const labelWidth = 232;
        canvas.width = 256;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to prepare QR code image.');
        context.font = '24px sans-serif';
        const words = displayLabel.split(/\s+/);
        const lines: string[] = [];
        let line = '';
        const fitWithEllipsis = (text: string): string => {
            let fitted = text;
            while (fitted.length > 1 && context.measureText(`${fitted}…`).width > labelWidth) {
                fitted = fitted.slice(0, -1).trimEnd();
            }
            return `${fitted}…`;
        };
        words.forEach((word, index) => {
            const candidate = line ? `${line} ${word}` : word;
            if (line && context.measureText(candidate).width > labelWidth) {
                lines.push(line);
                line = '';
                if (lines.length === 1) line = word;
                else line = fitWithEllipsis(`${line} ${words.slice(index).join(' ')}`.trim());
            } else {
                line = candidate;
            }
        });
        if (line) lines.push(line);
        if (lines.length > 2) lines.splice(2);
        canvas.height = 256 + labelPadding * 2 + lines.length * lineHeight;
        // Setting canvas.height resets the drawing context state, including
        // the font, so apply the print font again after sizing the canvas.
        context.font = '24px sans-serif';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, 256, 256);
        context.fillStyle = '#333333';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        lines.forEach((text, index) => {
            context.fillText(text, canvas.width / 2, 256 + labelPadding + index * lineHeight);
        });
        return canvas.toDataURL('image/png');
    }
    async function downloadInventoryTypeQr(row: Row, label?: InventoryLabel) {
        try {
            const qrDataUrl = await createInventoryTypeQrDataUrl(row, label);
            const link = document.createElement('a');
            link.href = qrDataUrl;
            link.download = label
                ? inventoryLabelQrFilename(row as InventoryTypeDTO, label)
                : inventoryTypeQrFilename(row as InventoryTypeDTO);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            showErrorAlert(error);
        }
    }
    async function removeInventoryLabel(label: InventoryLabel) {
        setLabelBusy(true);
        try {
            await api.deleteInventoryLabel(label.Id, generateRequestId());
            await invalidate({
                resource: 'inventory-types',
                invalidates: ['list', 'many', 'detail'],
            });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setLabelBusy(false);
        }
    }
    function openAddInventoryLabel() {
        setLabelEditor(null);
        setLabelEditorName('');
        setLabelEditorOpen(true);
    }
    function openEditInventoryLabel(label: InventoryLabel) {
        setLabelEditor(label);
        setLabelEditorName(label.Name);
        setLabelEditorOpen(true);
    }
    function closeInventoryLabelEditor() {
        setLabelEditorOpen(false);
        setLabelEditor(null);
        setLabelEditorName('');
    }
    async function saveInventoryLabel(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedInventoryType || !labelEditorName.trim()) return;
        setLabelBusy(true);
        try {
            if (labelEditor) {
                await api.updateInventoryLabel(
                    labelEditor.Id,
                    { name: labelEditorName.trim() },
                    generateRequestId(),
                );
            } else {
                await api.createInventoryLabel(
                    {
                        inventoryTypeId: String(selectedInventoryType.Id),
                        name: labelEditorName.trim(),
                    },
                    generateRequestId(),
                );
            }
            closeInventoryLabelEditor();
            await invalidate({
                resource: 'inventory-types',
                invalidates: ['list', 'many', 'detail'],
            });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setLabelBusy(false);
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
                    if (field.type === 'select' && field.optionsResource) {
                        return (
                            selectOptionLabelById.get(String(value ?? '')) ?? String(value ?? '')
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
    const inventoryTypeCards = resourceLoading ? (
        <div className="py-8 text-center">
            <Typography.Text type="secondary">Loading…</Typography.Text>
        </div>
    ) : filteredRows.length > 0 ? (
        <div className="inventory-type-grid">
            {filteredRows.map((row) => {
                const available = Number(row.availableQuantity ?? 0);
                const total = Number(row.TotalQuantity ?? 0);
                return (
                    <BlockCard
                        key={row.Id}
                        className="inventory-type-card"
                        onClick={() => navigate(inventoryTypePath(String(row.Id)))}>
                        <div className="inventory-type-card-heading">
                            <strong>{inventoryTypeDisplayName(row) || 'Unnamed equipment'}</strong>
                            {row.Location && (
                                <span className="inventory-type-card-description">
                                    {String(row.Location)}
                                </span>
                            )}
                            <span
                                className={`inventory-type-card-availability ${stockLevelTextClass(available, total)}`}>
                                {formatInventoryAvailability(available, total)}
                            </span>
                        </div>
                        <div className="inventory-type-card-image">
                            <RequestImage
                                imageId={String(row.ImageId || '')}
                                alt={inventoryTypeDisplayName(row)}
                                fallback={<span>No photo</span>}
                            />
                        </div>
                    </BlockCard>
                );
            })}
        </div>
    ) : (
        <Empty description={config.emptyMessage} />
    );
    const departmentCards = resourceLoading ? (
        <div className="py-8 text-center">
            <Typography.Text type="secondary">Loading…</Typography.Text>
        </div>
    ) : filteredRows.length > 0 ? (
        <div className="department-list">
            {filteredRows.map((row) => (
                <BlockCard
                    key={row.Id}
                    className="department-card"
                    onClick={() => navigate(departmentPath(String(row.Id)))}>
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
                    onChange={(event) => {
                        const value = event.target.value;
                        setSearch(value);
                        if (!value) setAppliedSearch('');
                    }}
                    onPressEnter={() => setAppliedSearch(search)}
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
                        {inventoryTypeDisplayName(selectedInventoryType) || 'Unnamed equipment'}
                    </Typography.Title>
                </div>
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate(inventoryTypesPath, { replace: true })}
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
                            ['Serial number', String(selectedInventoryType.DisplayId ?? '—')],
                            ['Name', String(selectedInventoryType.Name || 'Unnamed equipment')],
                            ['Brand', String(selectedInventoryType.Brand || '—')],
                            ['Model', String(selectedInventoryType.Model || '—')],
                            ['Location', String(selectedInventoryType.Location || '—')],
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
                    className="inventory-image-section"
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
                    <div className="inventory-request-image-frame">
                        <RequestImage
                            imageId={String(selectedInventoryType.ImageId || '')}
                            alt={String(selectedInventoryType.Name || '')}
                            className="inventory-request-image"
                            fallback={<span>No photo</span>}
                        />
                    </div>
                </DetailSection>
                <DetailSection
                    title="QR code"
                    action={
                        <Space>
                            <Select
                                value={selectedQrLabelId}
                                onChange={(value) => {
                                    setSelectedQrLabelId(value);
                                    const labels = (selectedInventoryType.labels ||
                                        []) as InventoryLabel[];
                                    const label = labels.find((entry) => entry.Id === value);
                                    void createInventoryTypeQrDataUrl(selectedInventoryType, label)
                                        .then(setQrCodeUrl)
                                        .catch(showErrorAlert);
                                }}
                                aria-label="QR code to download"
                                options={[
                                    { value: '', label: 'Inventory type (no label)' },
                                    ...(
                                        (selectedInventoryType.labels || []) as InventoryLabel[]
                                    ).map((label) => ({
                                        value: label.Id,
                                        label: label.Name,
                                    })),
                                ]}
                            />
                            <Button
                                type="primary"
                                icon={<DownloadOutlined />}
                                onClick={() => {
                                    const labels = (selectedInventoryType.labels ||
                                        []) as InventoryLabel[];
                                    const label = labels.find(
                                        (entry) => entry.Id === selectedQrLabelId,
                                    );
                                    void downloadInventoryTypeQr(selectedInventoryType, label);
                                }}
                                aria-label="Download QR code"
                                title="Download QR code"
                            />
                        </Space>
                    }>
                    <div className="flex justify-center">
                        {qrCodeUrl ? (
                            <img
                                src={qrCodeUrl}
                                alt={`QR code for ${String(selectedInventoryType.Name || 'inventory type')}`}
                                width={256}
                                height="auto"
                            />
                        ) : (
                            <Typography.Text type="secondary">Preparing QR code…</Typography.Text>
                        )}
                    </div>
                </DetailSection>
                <DetailSection
                    title="Individual labels"
                    action={
                        canEdit ? (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={openAddInventoryLabel}
                                aria-label="Add label"
                                title="Add label"
                            />
                        ) : null
                    }>
                    <div className="grid gap-3">
                        {(selectedInventoryType.labels || []).length ? (
                            <Table
                                rowKey="Id"
                                pagination={false}
                                dataSource={selectedInventoryType.labels || []}
                                columns={[
                                    {
                                        title: 'Serial number',
                                        dataIndex: 'DisplayId',
                                        key: 'DisplayId',
                                        render: (_: unknown, label: InventoryLabel) =>
                                            String(label.DisplayId ?? '—'),
                                    },
                                    {
                                        title: 'Label name',
                                        dataIndex: 'Name',
                                        key: 'Name',
                                        render: (_: unknown, label: InventoryLabel) => label.Name,
                                    },
                                    {
                                        title: 'Actions',
                                        key: 'actions',
                                        align: 'right' as const,
                                        render: (_: unknown, label: InventoryLabel) => (
                                            <Space>
                                                {canEdit && (
                                                    <Button
                                                        type="text"
                                                        icon={<EditOutlined />}
                                                        disabled={labelBusy}
                                                        onClick={() =>
                                                            openEditInventoryLabel(label)
                                                        }
                                                        aria-label={`Edit ${label.Name}`}
                                                    />
                                                )}
                                                <Button
                                                    type="text"
                                                    icon={<DownloadOutlined />}
                                                    onClick={() =>
                                                        void downloadInventoryTypeQr(
                                                            selectedInventoryType,
                                                            label,
                                                        )
                                                    }
                                                    aria-label={`Download QR for ${label.Name}`}
                                                />
                                                {canEdit && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        loading={labelBusy}
                                                        onClick={() =>
                                                            void removeInventoryLabel(label)
                                                        }
                                                        aria-label={`Delete ${label.Name}`}
                                                    />
                                                )}
                                            </Space>
                                        ),
                                    },
                                ]}
                                scroll={{ x: 'max-content' }}
                            />
                        ) : (
                            <Typography.Text type="secondary">
                                No individual labels configured.
                            </Typography.Text>
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
                        hrefFor={inventoryRequestPath}
                        onOpen={(id) => navigate(inventoryRequestPath(id))}
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
                        onClick={() => navigate(departmentsPath, { replace: true })}
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
                        hrefFor={programRequestPath}
                        onOpen={(id) => navigate(programRequestPath(id))}
                    />
                </DetailSection>
                <DetailSection span="full">
                    <RelatedRequestBlocks
                        title="Inventory requests"
                        kind="inventory"
                        items={departmentInventoryRequests}
                        dashboard={dashboard}
                        emptyMessage="No inventory requests for this department."
                        hrefFor={inventoryRequestPath}
                        onOpen={(id) => navigate(inventoryRequestPath(id))}
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
            {canEdit && labelEditorOpen && selectedInventoryType && (
                <Modal
                    open
                    title={labelEditor ? 'Edit label' : 'Add label'}
                    onCancel={closeInventoryLabelEditor}
                    footer={null}
                    destroyOnHidden>
                    <form className="grid gap-3" noValidate onSubmit={saveInventoryLabel}>
                        <TextField
                            name="labelName"
                            label="Label name"
                            value={labelEditorName}
                            required
                            onChange={(event) => setLabelEditorName(event.target.value)}
                        />
                        <SaveFooter label="Save" busy={labelBusy} errorMessage="" />
                    </form>
                </Modal>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={
                        config.kind === 'inventory-type'
                            ? `Delete “${deleting[config.fields[0].field]}”? This will also permanently delete its item rows from all existing inventory requests. The requests themselves and their other items will remain.`
                            : `Delete “${deleting[config.fields[0].field]}”?`
                    }
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        const row = deleting;
                        setDeleting(null);
                        const removed = await remove(row);
                        if (!removed) return;
                        if (config.kind === 'department')
                            navigate(departmentsPath, { replace: true });
                        if (config.kind === 'inventory-type')
                            navigate(inventoryTypesPath, { replace: true });
                    }}
                />
            )}
            {canEdit && (creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    onClose={closeEditor}
                    onSaved={save}
                    datalistOptions={{ 'inventory-brand-options': inventoryBrandOptions }}
                />
            )}
        </section>
    );
}

export function HomeContentPage({ dashboard }: { dashboard: DashboardPayload }) {
    const { refreshDashboard } = useDashboard();
    const [savingGuidelines, setSavingGuidelines] = useState(false);
    const canEdit = dashboard.me.Role === 'admin';

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
            {(['shift-types', 'program-types', 'program-languages', 'session-types'] as const).map(
                (key) => (
                    <SettingsResourcePage
                        key={key}
                        resourceName={key}
                        dashboard={dashboard}
                        compact
                    />
                ),
            )}
        </section>
    );
}

function AllowedEmailDomainsPage({ dashboard }: { dashboard: DashboardPayload }) {
    const canEdit = dashboard.me.Role === 'admin';
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
