import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useInvalidate, useList, useUpdate } from '@refinedev/core';
import {
    Button,
    Checkbox,
    Empty,
    Form,
    Input,
    Modal,
    Popover,
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
    FilePdfOutlined,
    HistoryOutlined,
    PlusOutlined,
    SearchOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { useDashboard } from '../dashboard-context';
import { inventoryRequestPath, inventoryTypePath, inventoryTypesPath } from '../paths';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { stockLevelTextClass } from '../ui/styles';
import { matchesSearch } from '../ui/search';
import {
    compareGroupKeys,
    groupInventoryTypes,
    inventoryLabelLocationKey,
    inventoryLabelQrFilename,
    inventoryTypeDisplayName,
    inventoryQrValue,
    sortInventoryLabels,
    inventoryTypeQrFilename,
    type InventoryGroupBy,
} from '../ui/inventory-qr';
import {
    buildQrStickerPdf,
    inventoryLabelLocations,
    inventoryLabelStickerEntries,
} from '../ui/inventory-qr-pdf';
import { TableView } from '../ui/table-view';
import { formatInventoryAvailability } from '../ui/inventory-stock';
import { uploadTargetImage } from '../ui/image-upload';
import { RequestImage } from '../ui/request-image';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { useRelatedRequests } from '../ui/related-requests';
import { BlockCard } from '../ui/block-card';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { ActionConfirmation, SaveFooter, TextField } from './refine-shared';
import {
    Editor,
    SettingsDetailFields,
    rowKeyOf,
    useResourceMutations,
    type ResourceConfig,
    type Row,
} from './settings-editor';
import { canManageConfig } from '../workflows';

const INVENTORY_TYPE_CONFIG: ResourceConfig = {
    kind: 'inventory-type',
    title: 'Inventory types',
    addLabel: 'Add equipment',
    emptyMessage: 'No equipment catalogued yet.',
    fields: [
        { field: 'Name', label: 'Name' },
        { field: 'Brand', label: 'Brand', datalistId: 'inventory-brand-options' },
        { field: 'Model', label: 'Model' },
        {
            field: 'LocationId',
            label: 'Location',
            type: 'select',
            optionsResource: 'inventory-places',
            optionsLabel: 'No location',
        },
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
        locationId: v.LocationId,
        description: v.Description,
        requestable: v.Requestable === 'on',
        totalQuantity: v.TotalQuantity.trim() === '' ? null : Number(v.TotalQuantity),
    }),
};

async function createInventoryTypeQrDataUrl(row: Row, label?: InventoryLabel): Promise<string> {
    const QRCode = (await import('qrcode')).default;
    const code = inventoryQrValue(row as InventoryTypeDTO, label);
    const qrDataUrl = await QRCode.toDataURL(code, { margin: 2, width: 256 });
    const image = new Image();
    image.src = qrDataUrl;
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to prepare QR code image.'));
    });
    const captionHeight = 48;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256 + captionHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare QR code image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, 256, 256);
    context.fillStyle = '#000000';
    context.font = 'bold 40px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText(code, canvas.width / 2, 256 + 2, canvas.width - 16);
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

export function InventoryTypesPage({ dashboard }: { dashboard: DashboardPayload }) {
    const config = INVENTORY_TYPE_CONFIG;
    const navigate = useNavigate();
    const { refreshDashboard } = useDashboard();
    const { id: detailId = null } = useParams<{ id: string }>();
    const canEdit = canManageConfig(dashboard.me);
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result, query } = useList({ resource: 'inventory-types', pagination: { mode: 'off' } });
    const resourceLoading = query.isLoading;
    const rows = config.sortRows!(result.data as Row[]);
    const inventoryBrandOptions = Array.from(
        new Set(rows.map((row) => String(row.Brand || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const { result: inventoryPlacesResult } = useList({
        resource: 'inventory-places',
        pagination: { mode: 'off' },
    });
    const inventoryPlaceOptions = [
        { value: '', label: "Same as the type's location" },
        ...(inventoryPlacesResult.data as Row[])
            .map((place) => ({ value: String(place.Id), label: String(place.Name) }))
            .sort((a, b) => compareGroupKeys(a.label, b.label)),
    ];
    const { save, remove } = useResourceMutations('inventory-types', config);
    const { mutateAsync: updateRow } = useUpdate();
    const invalidate = useInvalidate();
    const selectedInventoryType = rows.find((row) => row.Id === detailId) || null;
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [selectedQrLabelId, setSelectedQrLabelId] = useState('');
    const [labelEditorOpen, setLabelEditorOpen] = useState(false);
    const [labelEditor, setLabelEditor] = useState<InventoryLabel | null>(null);
    const [labelEditorName, setLabelEditorName] = useState('');
    const [labelEditorLocation, setLabelEditorLocation] = useState('');
    const [labelBusy, setLabelBusy] = useState(false);
    const [historyLabel, setHistoryLabel] = useState<InventoryLabel | null>(null);
    const [qrPdfBusy, setQrPdfBusy] = useState(false);
    const [qrPdfOpen, setQrPdfOpen] = useState(false);
    const [qrPdfLocations, setQrPdfLocations] = useState<string[]>([]);
    const [qrPdfPrintLocation, setQrPdfPrintLocation] = useState(false);
    const [inventoryGroupBy, setInventoryGroupBy] = useState<InventoryGroupBy>('brand');
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const filteredRows = rows.filter((row) => matchesSearch(appliedSearch, Object.values(row)));
    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };
    // History is read from the request list endpoint (which sees every
    // request) rather than the dashboard's bounded recent sample.
    const typeRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        selectedInventoryType ? { inventoryTypeId: String(selectedInventoryType.Id) } : null,
    );
    const historyLabelRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        historyLabel ? { labelId: historyLabel.Id } : null,
    );
    useEffect(() => {
        if (!selectedInventoryType) {
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
    }, [selectedInventoryType?.Id]);
    async function uploadInventoryTypeImage(row: Row, file: File) {
        showSavingBadge(true);
        try {
            const imageId = await uploadTargetImage(file, {
                type: 'inventory_type',
                id: String(row.Id),
                fileName: `InventoryTypes-${String(row.Id)}.jpg`,
            });
            await updateRow({
                resource: 'inventory-types',
                id: row.Id,
                values: {
                    brand: String(row.Brand || ''),
                    name: String(row.Name || ''),
                    model: String(row.Model || ''),
                    locationId: String(row.LocationId || ''),
                    description: String(row.Description || ''),
                    requestable: row.Requestable !== false,
                    totalQuantity: row.TotalQuantity == null ? null : Number(row.TotalQuantity),
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
    const labelLocations = inventoryLabelLocations(rows as InventoryTypeDTO[]);
    function toggleQrPdfOpen(open: boolean) {
        // Every location starts ticked, so a plain click on Download still
        // exports everything.
        if (open) setQrPdfLocations(labelLocations.map((location) => location.key));
        setQrPdfOpen(open);
    }
    async function downloadLabelQrPdf() {
        setQrPdfBusy(true);
        try {
            const QRCode = (await import('qrcode')).default;
            const entries = inventoryLabelStickerEntries(
                rows as InventoryTypeDTO[],
                (text) => QRCode.create(text, { errorCorrectionLevel: 'Q' }).modules,
                qrPdfLocations,
                { printLocation: qrPdfPrintLocation },
            );
            const url = URL.createObjectURL(
                new Blob([buildQrStickerPdf(entries)], { type: 'application/pdf' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'inventory-label-qr-codes.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setQrPdfOpen(false);
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setQrPdfBusy(false);
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
        setLabelEditorLocation('');
        setLabelEditorOpen(true);
    }
    function openEditInventoryLabel(label: InventoryLabel) {
        setLabelEditor(label);
        setLabelEditorName(label.Name);
        setLabelEditorLocation(label.LocationId || '');
        setLabelEditorOpen(true);
    }
    function closeInventoryLabelEditor() {
        setLabelEditorOpen(false);
        setLabelEditor(null);
        setLabelEditorName('');
        setLabelEditorLocation('');
    }
    async function saveInventoryLabel(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedInventoryType || !labelEditorName.trim()) return;
        setLabelBusy(true);
        try {
            if (labelEditor) {
                await api.updateInventoryLabel(
                    labelEditor.Id,
                    { name: labelEditorName.trim(), locationId: labelEditorLocation },
                    generateRequestId(),
                );
            } else {
                await api.createInventoryLabel(
                    {
                        inventoryTypeId: String(selectedInventoryType.Id),
                        name: labelEditorName.trim(),
                        locationId: labelEditorLocation,
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
    const inventoryTypeCards = resourceLoading ? (
        <div className="py-8 text-center">
            <Typography.Text type="secondary">Loading…</Typography.Text>
        </div>
    ) : filteredRows.length > 0 ? (
        <div className="grid gap-6">
            {groupInventoryTypes(filteredRows, inventoryGroupBy).map((group) => (
                <section key={group.key}>
                    <div className="related-request-heading">
                        <Typography.Title level={3}>
                            {group.title} <Tag>{group.rows.length}</Tag>
                        </Typography.Title>
                    </div>
                    <div className="inventory-type-grid">
                        {group.rows.map((row) => (
                            <BlockCard
                                key={row.Id}
                                className="inventory-type-card"
                                href={inventoryTypePath(String(row.Id))}
                                onClick={() => navigate(inventoryTypePath(String(row.Id)))}>
                                <div className="inventory-type-card-heading">
                                    <strong>
                                        {inventoryGroupBy === 'serial' &&
                                            `#${String(row.DisplayId)} `}
                                        {inventoryTypeDisplayName(row) || 'Unnamed equipment'}
                                    </strong>
                                    {row.Location && inventoryGroupBy !== 'location' && (
                                        <span className="inventory-type-card-description">
                                            {String(row.Location)}
                                        </span>
                                    )}
                                    {row.TotalQuantity != null && (
                                        <span
                                            className={`inventory-type-card-availability ${stockLevelTextClass(Number(row.availableQuantity), Number(row.TotalQuantity))}`}>
                                            {formatInventoryAvailability(
                                                Number(row.availableQuantity),
                                                Number(row.TotalQuantity),
                                            )}
                                        </span>
                                    )}
                                </div>
                                <div className="inventory-type-card-image">
                                    <RequestImage
                                        imageId={String(row.ImageId || '')}
                                        alt={inventoryTypeDisplayName(row)}
                                        fallback={<span>No photo</span>}
                                    />
                                </div>
                            </BlockCard>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    ) : (
        <Empty description={config.emptyMessage} />
    );
    const inventoryTypeHeader = (
        <div className="antd-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>{config.title}</Typography.Title>
            </div>
            <Space className="antd-board-filters" wrap>
                <Select
                    value={inventoryGroupBy}
                    onChange={setInventoryGroupBy}
                    aria-label="Group inventory types by"
                    popupMatchSelectWidth={false}
                    options={[
                        { value: '', label: 'Group by', disabled: true },
                        { value: 'brand', label: 'Brand' },
                        { value: 'location', label: 'Location' },
                        { value: 'serial', label: 'Serial (QR number)' },
                    ]}
                />
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder={`Search ${config.title.toLowerCase()}`}
                    aria-label={`Search ${config.title.toLowerCase()}`}
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
            <Popover
                trigger="click"
                placement="bottomRight"
                open={qrPdfOpen}
                onOpenChange={toggleQrPdfOpen}
                title="Label QR codes PDF"
                content={
                    <Space direction="vertical">
                        <Checkbox
                            checked={qrPdfLocations.length === labelLocations.length}
                            indeterminate={
                                qrPdfLocations.length > 0 &&
                                qrPdfLocations.length < labelLocations.length
                            }
                            onChange={(event) =>
                                setQrPdfLocations(
                                    event.target.checked
                                        ? labelLocations.map((location) => location.key)
                                        : [],
                                )
                            }>
                            All locations
                        </Checkbox>
                        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            <Space direction="vertical">
                                {labelLocations.map((location) => (
                                    <Checkbox
                                        key={location.key}
                                        checked={qrPdfLocations.includes(location.key)}
                                        onChange={(event) =>
                                            setQrPdfLocations(
                                                event.target.checked
                                                    ? [...qrPdfLocations, location.key]
                                                    : qrPdfLocations.filter(
                                                          (key) => key !== location.key,
                                                      ),
                                            )
                                        }>
                                        {location.title} ({location.labelCount})
                                    </Checkbox>
                                ))}
                            </Space>
                        </div>
                        <Checkbox
                            checked={qrPdfPrintLocation}
                            onChange={(event) => setQrPdfPrintLocation(event.target.checked)}>
                            Print location on stickers
                        </Checkbox>
                        <Button
                            type="primary"
                            icon={<FilePdfOutlined />}
                            loading={qrPdfBusy}
                            disabled={!qrPdfLocations.length}
                            onClick={() => void downloadLabelQrPdf()}>
                            Download PDF
                        </Button>
                    </Space>
                }>
                <Button
                    type="primary"
                    icon={<FilePdfOutlined />}
                    disabled={!labelLocations.length}
                    aria-label="Download label QR codes PDF"
                    title="Download label QR codes PDF"
                />
            </Popover>
            {canEdit && (
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreating(true)}
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
                    <Space size="middle">
                        {canEdit && (
                            <>
                                <Button
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={() => setEditing(selectedInventoryType)}
                                    aria-label="Edit"
                                />
                                <Button
                                    type="primary"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => setDeleting(selectedInventoryType)}
                                    aria-label="Delete"
                                />
                            </>
                        )}
                    </Space>
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
                            ...(selectedInventoryType.TotalQuantity == null
                                ? []
                                : [
                                      [
                                          'Availability',
                                          formatInventoryAvailability(
                                              Number(selectedInventoryType.availableQuantity),
                                              Number(selectedInventoryType.TotalQuantity),
                                          ),
                                      ] as [string, string],
                                      [
                                          'Total quantity',
                                          String(selectedInventoryType.TotalQuantity),
                                      ] as [string, string],
                                  ]),
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
                                popupMatchSelectWidth={false}
                                options={[
                                    { value: 'heading', label: 'QR code for', disabled: true },
                                    { value: '', label: 'Inventory type' },
                                    ...sortInventoryLabels(selectedInventoryType.labels).map(
                                        (label) => ({
                                            value: label.Id,
                                            label: label.Name,
                                        }),
                                    ),
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
                <DetailSection className="table-detail-section">
                    <TableView
                        title="Individual labels"
                        count={(selectedInventoryType.labels || []).length}
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
                        {(selectedInventoryType.labels || []).length ? (
                            <Table
                                rowKey="Id"
                                pagination={false}
                                dataSource={sortInventoryLabels(selectedInventoryType.labels)}
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
                                        title: 'Location',
                                        key: 'Location',
                                        render: (_: unknown, label: InventoryLabel) =>
                                            inventoryLabelLocationKey(
                                                selectedInventoryType as InventoryTypeDTO,
                                                label,
                                            ) || '—',
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
                                                    icon={<HistoryOutlined />}
                                                    onClick={() => setHistoryLabel(label)}
                                                    aria-label={`View requests for ${label.Name}`}
                                                    title="View requests"
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
                    </TableView>
                </DetailSection>
                {typeRequests.total > 0 && (
                    <DetailSection span="full">
                        <RelatedRequestBlocks
                            title="Inventory requests"
                            kind="inventory"
                            items={typeRequests.items}
                            total={typeRequests.total}
                            dashboard={dashboard}
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    </DetailSection>
                )}
            </DetailSections>
        </>
    );
    return (
        <section className={`antd-page${selectedInventoryType ? ' detail-page' : ''}`}>
            {selectedInventoryType ? (
                inventoryTypeDetail
            ) : (
                <>
                    {inventoryTypeHeader}
                    {inventoryTypeCards}
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
                        <Form.Item label="Location">
                            <Select
                                value={labelEditorLocation}
                                onChange={setLabelEditorLocation}
                                aria-label="Location"
                                showSearch
                                optionFilterProp="label"
                                options={inventoryPlaceOptions}
                            />
                        </Form.Item>
                        <SaveFooter label="Save" busy={labelBusy} errorMessage="" />
                    </form>
                </Modal>
            )}
            {historyLabel && (
                <Modal
                    open
                    title={`Requests for ${historyLabel.Name}`}
                    onCancel={() => setHistoryLabel(null)}
                    footer={null}
                    width={720}
                    destroyOnHidden>
                    {historyLabelRequests.total > 0 ? (
                        <RelatedRequestBlocks
                            title="Inventory requests"
                            kind="inventory"
                            items={historyLabelRequests.items}
                            total={historyLabelRequests.total}
                            dashboard={dashboard}
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    ) : (
                        <Empty description="This label has not been used in any request." />
                    )}
                </Modal>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Delete “${deleting[config.fields[0].field]}”? This will also permanently delete its item rows from all existing inventory requests. The requests themselves and their other items will remain.`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        const row = deleting;
                        setDeleting(null);
                        const removed = await remove(row);
                        if (!removed) return;
                        navigate(inventoryTypesPath, { replace: true });
                    }}
                />
            )}
            {canEdit && (creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    onClose={closeEditor}
                    onSaved={async (values) => {
                        const created = await save(values, editing);
                        if (created) {
                            navigate(inventoryTypePath(rowKeyOf(config, created)), {
                                replace: true,
                            });
                        }
                    }}
                    datalistOptions={{ 'inventory-brand-options': inventoryBrandOptions }}
                />
            )}
        </section>
    );
}
