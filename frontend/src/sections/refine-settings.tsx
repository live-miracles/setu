import { useState, type FormEvent } from 'react';
import { Button, Card, Checkbox, Empty, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import {
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    PlusOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { refreshDashboard } from '../router';
import { mountRefinePage } from '../ui/refine';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTime } from '../ui/format';
import { stockLevelTextClass } from '../ui/styles';
import { inventoryTypeQrFilename, inventoryTypeQrLabel } from '../ui/inventory-qr';
import { formatInventoryAvailability } from '../ui/inventory-stock';
import { ActionConfirmation } from './refine-app';

type Field = { field: string; label: string; type?: string; hiddenInTable?: boolean };
type Row = Record<string, any>;

interface ResourceConfig {
    kind: string;
    title: string;
    addLabel: string;
    emptyMessage: string;
    fields: Field[];
    rows: (dashboard: DashboardPayload) => Row[];
    create: (values: Record<string, string>) => Promise<unknown>;
    update: (id: string, values: Record<string, string>) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
}

const requestId = () => generateRequestId();
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
        rows: (d) => d.places,
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
        addLabel: 'Add program type',
        emptyMessage: 'No program types configured yet.',
        fields: [
            { field: 'Name', label: 'Name' },
            { field: 'Color', label: 'Color', type: 'color' },
        ],
        rows: (d) => d.programTypes,
        create: (v) => api.createProgramType({ name: v.Name, color: v.Color }, requestId()),
        update: (id, v) => api.updateProgramType(id, { name: v.Name, color: v.Color }, requestId()),
        remove: (id) => api.deleteProgramType(id, requestId()),
    },
    'program-languages': {
        kind: 'program-language',
        title: 'Program languages',
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
        if (!event.currentTarget.checkValidity()) {
            event.currentTarget.reportValidity();
            return;
        }
        setBusy(true);
        try {
            const data = new FormData(event.currentTarget);
            const values = Object.fromEntries(config.fields.map((f) => [f.field, value(data, f)]));
            config.fields
                .filter((field) => field.type === 'color' && data.get(`${field.field}Enabled`) !== 'on')
                .forEach((field) => {
                    values[field.field] = '';
                });
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
                    {field.type === 'color' ? (
                        <Space>
                            <Input
                                name={field.field}
                                type="color"
                                defaultValue={inputValue(field, row?.[field.field]) || '#ffffff'}
                            />
                            <Checkbox
                                name={`${field.field}Enabled`}
                                defaultChecked={Boolean(row?.[field.field])}>
                                Use color
                            </Checkbox>
                        </Space>
                    ) : (
                        <Input
                            name={field.field}
                            type={field.type || 'text'}
                            required={index === 0}
                            defaultValue={inputValue(field, row?.[field.field])}
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
    onClose,
    onSaved,
}: {
    config: ResourceConfig;
    row?: Row;
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
                onSubmit={async (values) => {
                    await onSaved(values);
                    onClose();
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
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const [search, setSearch] = useState('');
    const rows = config.rows(dashboard);
    const hasSearch = config.kind === 'department' || config.kind === 'inventory-type';
    const filteredRows = hasSearch
        ? rows.filter((row) =>
              Object.values(row).some((value) =>
                  String(value ?? '')
                      .toLowerCase()
                      .includes(search.toLowerCase()),
              ),
          )
        : rows;
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
    async function downloadInventoryTypeQr(row: Row) {
        try {
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
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = inventoryTypeQrFilename(row as InventoryTypeDTO);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            showErrorAlert(error);
        }
    }
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
                    return field.type === 'datetime-local'
                        ? formatDateTime(String(value || ''))
                        : String(value ?? '');
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
            render: (_: unknown, row: Row) => (
                <Space>
                    {config.kind === 'inventory-type' && (
                        <Button
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={() => void downloadInventoryTypeQr(row)}
                            aria-label="Download QR code"
                            title="Download QR code"
                        />
                    )}
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(row)}
                        aria-label="Edit"
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setDeleting(row)}
                        aria-label="Delete"
                    />
                </Space>
            ),
        },
    ];
    return (
        <section className={compact ? 'antd-settings-compact' : 'antd-page'}>
            {!compact && (
                <div className="antd-page-heading">
                    <div>
                        <Typography.Title level={2}>{config.title}</Typography.Title>
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}>
                        Add
                    </Button>
                </div>
            )}
            <Card
                title={config.title}
                extra={
                    compact ? (
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => setCreating(true)}>
                            Add
                        </Button>
                    ) : (
                        <Tag>{rows.length}</Tag>
                    )
                }>
                {hasSearch && (
                    <div className="antd-table-search">
                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder={`Search ${config.title.toLowerCase()}`}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                )}
                <Table
                    rowKey="Id"
                    columns={columns}
                    dataSource={filteredRows}
                    locale={{ emptyText: <Empty description={config.emptyMessage} /> }}
                    pagination={false}
                />
            </Card>
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Delete “${deleting[config.fields[0].field]}”?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await remove(deleting);
                        setDeleting(null);
                    }}
                />
            )}
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
    const [savingGuidelines, setSavingGuidelines] = useState(false);

    async function saveGuidelines(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSavingGuidelines(true);
        try {
            const data = new FormData(event.currentTarget);
            await api.updateHomeContent({
                guidelines: String(data.get('guidelines') || ''),
            });
            await refreshDashboard();
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setSavingGuidelines(false);
        }
    }

    return (
        <section className="antd-page">
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>Other settings</Typography.Title>
                    <Typography.Paragraph type="secondary">
                        Guidelines and reusable options used throughout the app.
                    </Typography.Paragraph>
                </div>
            </div>
            <Card title="Guidelines">
                <form onSubmit={saveGuidelines}>
                    <Form.Item label="Guidelines">
                        <Input.TextArea
                            name="guidelines"
                            rows={6}
                            defaultValue={dashboard.homeContent.Guidelines}
                        />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={savingGuidelines}>
                        Save
                    </Button>
                </form>
            </Card>
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
