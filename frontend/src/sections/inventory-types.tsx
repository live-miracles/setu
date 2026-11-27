import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useInvalidate, useList, useUpdate } from '../ui/resources';
import { Select, Field } from '../ui/form-kit';
import { ListHeading, SearchBox } from '../ui/list-heading';
import { Modal } from '../ui/overlay-kit';
import { saveFile } from '../ui/save-file';
import { Table, Button, Empty, Space, Tag, Typography } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useHomeContent, useMe } from '../ui/reference';
import {
    inventoryLabelsPath,
    inventoryRequestPath,
    inventoryTypePath,
    inventoryTypesPath,
} from '../paths';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { stockLevelTextClass } from '../ui/styles';
import { matchesSearch } from '../ui/search';
import {
    compareGroupKeys,
    groupInventoryTypes,
    inventoryLabelDisplayName,
    inventoryTypeDisplayName,
    sortInventoryLabelsByLocation,
    type InventoryGroupBy,
    type InventoryLabelGroupBy,
} from '../ui/inventory-qr';
import {
    buildQrStickerPdf,
    inventoryLabelLocations,
    inventoryLabelStickerEntries,
} from '../ui/inventory-qr-pdf';
import { TableView } from '../ui/table-view';
import { InventoryKindHeading } from '../ui/inventory-kind-heading';
import type { InventoryKind } from '../ui/inventory-kind';
import { InventoryLabelCards, readStoredLabelGroupBy, storeLabelGroupBy } from './inventory-labels';
import { formatInventoryAvailability } from '../ui/inventory-stock';
import { uploadTargetImage } from '../ui/image-upload';
import { RequestImage } from '../ui/request-image';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { useRelatedRequests } from '../ui/related-requests';
import { BlockCard } from '../ui/block-card';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { DetailBackButton, DetailHeading, MasterDetail } from '../ui/master-detail';
import { ActionConfirmation } from './action-confirmation';
import { SaveFooter, TextField } from './form-fields';
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
        {
            field: 'Brand',
            label: 'Brand',
            type: 'select',
            optionsResource: 'inventory-brands',
            // The type keeps the brand's name (empty for none), not its id.
            optionsValueKey: 'Name',
            optionsLabel: 'No brand',
        },
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

const GROUP_BY_STORAGE_KEY = 'setu:inventory-types-group-by';
const GROUP_BY_VALUES: InventoryGroupBy[] = ['brand', 'location', 'serial'];

// The last chosen grouping is remembered in this browser; unavailable storage
// (private browsing) just falls back to the default.
function readStoredGroupBy(): InventoryGroupBy {
    try {
        const stored = window.localStorage.getItem(GROUP_BY_STORAGE_KEY);
        return GROUP_BY_VALUES.find((value) => value === stored) ?? 'brand';
    } catch {
        return 'brand';
    }
}

function storeGroupBy(value: InventoryGroupBy): void {
    try {
        window.localStorage.setItem(GROUP_BY_STORAGE_KEY, value);
    } catch {
        // Not being able to remember the choice must not block changing it.
    }
}

// The Types view lists equipment types; the Labels view lists every labelled
// unit instead. Both open the selected type's details beside the list, so the
// open type stays in the URL of whichever view is showing.
export function InventoryTypesPage({ kind = 'types' }: { kind?: InventoryKind }) {
    const config = INVENTORY_TYPE_CONFIG;
    const isLabels = kind === 'labels';
    const listPath = isLabels ? inventoryLabelsPath : inventoryTypesPath;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const selectedLabelId = searchParams.get('label');
    const homeContent = useHomeContent();
    const { id: detailId = null } = useParams<{ id: string }>();
    const canEdit = canManageConfig(useMe());
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result, query } = useList({ resource: 'inventory-types', pagination: { mode: 'off' } });
    const resourceLoading = query.isLoading;
    const rows = config.sortRows!(result.data as Row[]);
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
    const [labelEditorOpen, setLabelEditorOpen] = useState(false);
    const [labelEditor, setLabelEditor] = useState<InventoryLabel | null>(null);
    const [labelEditorName, setLabelEditorName] = useState('');
    const [labelEditorLocation, setLabelEditorLocation] = useState('');
    const [labelBusy, setLabelBusy] = useState(false);
    const [historyLabel, setHistoryLabel] = useState<InventoryLabel | null>(null);
    const [qrPdfBusy, setQrPdfBusy] = useState(false);
    const [qrPdfOpen, setQrPdfOpen] = useState(false);
    const [qrPdfLocations, setQrPdfLocations] = useState<string[]>([]);
    const [inventoryGroupBy, setInventoryGroupBy] = useState<InventoryGroupBy>(readStoredGroupBy);
    const changeInventoryGroupBy = (value: InventoryGroupBy) => {
        setInventoryGroupBy(value);
        storeGroupBy(value);
    };
    const [labelGroupBy, setLabelGroupBy] = useState<InventoryLabelGroupBy>(readStoredLabelGroupBy);
    const changeLabelGroupBy = (value: InventoryLabelGroupBy) => {
        setLabelGroupBy(value);
        storeLabelGroupBy(value);
    };
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const filteredRows = rows.filter((row) => matchesSearch(appliedSearch, Object.values(row)));
    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };
    // History is read from the request list endpoint (which sees every
    // request) rather than the home screen's bounded sample.
    const typeRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        selectedInventoryType ? { inventoryTypeId: String(selectedInventoryType.Id) } : null,
    );
    const historyLabelRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        historyLabel ? { labelId: historyLabel.Id } : null,
    );
    async function uploadInventoryTypeImage(row: Row, file: File) {
        showSavingBadge(true);
        try {
            const imageId = await uploadTargetImage(file, {
                type: 'inventory_type',
                id: String(row.Id),
                fileName: `InventoryTypes-${String(row.Id)}.webp`,
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
            });
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
            );
            await saveFile(
                buildQrStickerPdf(entries),
                'inventory-label-qr-codes.pdf',
                'application/pdf',
            );
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
            await api.deleteInventoryLabel(label.Id);
            await invalidate({
                resource: 'inventory-types',
            });
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
        if (!selectedInventoryType) return;
        setLabelBusy(true);
        try {
            if (labelEditor) {
                await api.updateInventoryLabel(labelEditor.Id, {
                    name: labelEditorName.trim(),
                    locationId: labelEditorLocation,
                });
            } else {
                await api.createInventoryLabel({
                    inventoryTypeId: String(selectedInventoryType.Id),
                    name: labelEditorName.trim(),
                    locationId: labelEditorLocation,
                });
            }
            closeInventoryLabelEditor();
            await invalidate({
                resource: 'inventory-types',
            });
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setLabelBusy(false);
        }
    }
    const inventoryTypeCards = isLabels ? (
        <InventoryLabelCards
            types={rows as InventoryTypeDTO[]}
            groupBy={labelGroupBy}
            search={appliedSearch}
            selectedLabelId={selectedLabelId}
            loading={resourceLoading}
        />
    ) : resourceLoading ? (
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
                                selected={row.Id === detailId}
                                onClick={() => navigate(inventoryTypePath(String(row.Id)))}>
                                <div className="inventory-type-card-heading">
                                    <strong>
                                        {row.Requestable === false && (
                                            <Icon
                                                name="eyeOff"
                                                className="mr-1"
                                                aria-label="Not requestable"
                                                title="Not requestable"
                                            />
                                        )}
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
    const searchNoun = isLabels ? 'inventory labels' : config.title.toLowerCase();
    const allLocationsPicked = qrPdfLocations.length === labelLocations.length;
    const pickedLabelCount = labelLocations
        .filter((location) => qrPdfLocations.includes(location.key))
        .reduce((sum, location) => sum + location.labelCount, 0);
    const qrPdfRow = 'flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-paper';
    const qrPdfButton = (
        <>
            <Button
                type="primary"
                icon={<Icon name="filePdf" />}
                disabled={!labelLocations.length}
                aria-label="Download label QR codes PDF"
                title="Download label QR codes PDF"
                onClick={() => toggleQrPdfOpen(true)}
            />
            {qrPdfOpen && (
                <Modal title="Label QR codes PDF" close={() => toggleQrPdfOpen(false)}>
                    <p className="mb-3 mt-0 text-sm text-steel">
                        Choose the locations whose labels go on the printable sticker sheet.
                    </p>
                    <div className="overflow-hidden rounded-lg border border-line">
                        <label className={`${qrPdfRow} border-b border-line font-semibold`}>
                            <input
                                type="checkbox"
                                className="size-4 cursor-pointer accent-accent"
                                checked={allLocationsPicked}
                                ref={(element) => {
                                    if (element)
                                        element.indeterminate =
                                            qrPdfLocations.length > 0 && !allLocationsPicked;
                                }}
                                onChange={(event) =>
                                    setQrPdfLocations(
                                        event.target.checked
                                            ? labelLocations.map((location) => location.key)
                                            : [],
                                    )
                                }
                            />
                            <span className="flex-1">All locations</span>
                        </label>
                        <div className="max-h-[45dvh] divide-y divide-line overflow-y-auto">
                            {labelLocations.map((location) => (
                                <label key={location.key} className={qrPdfRow}>
                                    <input
                                        type="checkbox"
                                        className="size-4 cursor-pointer accent-accent"
                                        checked={qrPdfLocations.includes(location.key)}
                                        onChange={(event) =>
                                            setQrPdfLocations(
                                                event.target.checked
                                                    ? [...qrPdfLocations, location.key]
                                                    : qrPdfLocations.filter(
                                                          (key) => key !== location.key,
                                                      ),
                                            )
                                        }
                                    />
                                    <span className="flex-1 text-sm">{location.title}</span>
                                    <span className="text-sm text-steel">
                                        {location.labelCount}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="whitespace-nowrap text-sm text-steel">
                            {pickedLabelCount} label{pickedLabelCount === 1 ? '' : 's'}
                        </span>
                        <Space>
                            <Button onClick={() => toggleQrPdfOpen(false)}>Cancel</Button>
                            <Button
                                type="primary"
                                icon={<Icon name="filePdf" />}
                                loading={qrPdfBusy}
                                disabled={!qrPdfLocations.length}
                                onClick={() => void downloadLabelQrPdf()}>
                                Download PDF
                            </Button>
                        </Space>
                    </div>
                </Modal>
            )}
        </>
    );
    const inventoryTypeHeader = (
        <ListHeading
            title={<InventoryKindHeading kind={kind} homeContent={homeContent} />}
            actions={
                <>
                    {qrPdfButton}
                    {canEdit && !isLabels && (
                        <Button
                            type="primary"
                            icon={<Icon name="plus" />}
                            onClick={() => setCreating(true)}
                            aria-label={`Add ${config.kind}`}
                            title={`Add ${config.kind}`}
                        />
                    )}
                </>
            }>
            <SearchBox
                noun={searchNoun}
                value={search}
                onChange={(value) => {
                    setSearch(value);
                    if (!value) setAppliedSearch('');
                }}
                onSubmit={() => setAppliedSearch(search)}
            />
            {isLabels ? (
                <Select
                    value={labelGroupBy}
                    onChange={(value) => changeLabelGroupBy(value as InventoryLabelGroupBy)}
                    aria-label="Group inventory labels by"
                    options={[
                        { value: '', label: 'Group by', disabled: true },
                        { value: 'type', label: 'Type' },
                        { value: 'location', label: 'Location' },
                    ]}
                />
            ) : (
                <Select
                    value={inventoryGroupBy}
                    onChange={changeInventoryGroupBy}
                    aria-label="Group inventory types by"
                    options={[
                        { value: '', label: 'Group by', disabled: true },
                        { value: 'brand', label: 'Brand' },
                        { value: 'location', label: 'Location' },
                        { value: 'serial', label: 'Setu number' },
                    ]}
                />
            )}
        </ListHeading>
    );
    const inventoryTypeDetail = selectedInventoryType && (
        <>
            <DetailHeading
                title={inventoryTypeDisplayName(selectedInventoryType) || 'Unnamed equipment'}
                actions={
                    <Space wrap>
                        <DetailBackButton
                            label={isLabels ? 'Inventory labels' : config.title}
                            onClick={() => navigate(listPath, { replace: true })}
                        />
                        <Space size="middle">
                            {canEdit && (
                                <>
                                    <Button
                                        type="primary"
                                        icon={<Icon name="edit" />}
                                        onClick={() => setEditing(selectedInventoryType)}
                                        aria-label="Edit"
                                    />
                                    <Button
                                        type="primary"
                                        danger
                                        icon={<Icon name="trash" />}
                                        onClick={() => setDeleting(selectedInventoryType)}
                                        aria-label="Delete"
                                    />
                                </>
                            )}
                        </Space>
                    </Space>
                }
            />
            <DetailSections>
                <DetailSection title="Details">
                    <SettingsDetailFields
                        fields={[
                            ['Setu number', String(selectedInventoryType.DisplayId ?? '—')],
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
                                    icon={<Icon name="upload" />}
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
                <DetailSection className="table-detail-section">
                    <TableView
                        title="Individual labels"
                        count={(selectedInventoryType.labels || []).length}
                        action={
                            canEdit ? (
                                <Button
                                    type="primary"
                                    icon={<Icon name="plus" />}
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
                                dataSource={sortInventoryLabelsByLocation(
                                    selectedInventoryType as InventoryTypeDTO,
                                )}
                                columns={[
                                    {
                                        title: 'Setu number',
                                        dataIndex: 'DisplayId',
                                        key: 'DisplayId',
                                        render: (_: unknown, label: InventoryLabel) =>
                                            String(label.DisplayId ?? '—'),
                                    },
                                    {
                                        title: 'Label name',
                                        dataIndex: 'Name',
                                        key: 'Name',
                                        render: (_: unknown, label: InventoryLabel) =>
                                            label.Name || '—',
                                    },
                                    {
                                        title: 'Location',
                                        key: 'Location',
                                        // Only the label's own location; "same as the
                                        // type's location" shows a dash.
                                        render: (_: unknown, label: InventoryLabel) =>
                                            label.Location || '—',
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
                                                        icon={<Icon name="edit" />}
                                                        disabled={labelBusy}
                                                        onClick={() =>
                                                            openEditInventoryLabel(label)
                                                        }
                                                        aria-label={`Edit ${inventoryLabelDisplayName(label)}`}
                                                    />
                                                )}
                                                <Button
                                                    type="text"
                                                    icon={<Icon name="history" />}
                                                    onClick={() => setHistoryLabel(label)}
                                                    aria-label={`View requests for ${inventoryLabelDisplayName(label)}`}
                                                    title="View requests"
                                                />
                                                {canEdit && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<Icon name="trash" />}
                                                        loading={labelBusy}
                                                        onClick={() =>
                                                            void removeInventoryLabel(label)
                                                        }
                                                        aria-label={`Delete ${inventoryLabelDisplayName(label)}`}
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
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    </DetailSection>
                )}
            </DetailSections>
        </>
    );
    return (
        <MasterDetail
            heading={inventoryTypeHeader}
            list={inventoryTypeCards}
            detail={inventoryTypeDetail}
            detailKey={String(selectedInventoryType?.Id ?? '')}>
            {canEdit && labelEditorOpen && selectedInventoryType && (
                <Modal
                    title={labelEditor ? 'Edit label' : 'Add label'}
                    close={closeInventoryLabelEditor}>
                    <form className="grid gap-3" noValidate onSubmit={saveInventoryLabel}>
                        <TextField
                            name="labelName"
                            label="Label name (optional)"
                            value={labelEditorName}
                            onChange={(event) => setLabelEditorName(event.target.value)}
                        />
                        <Field label="Location">
                            <Select
                                value={labelEditorLocation}
                                onChange={setLabelEditorLocation}
                                aria-label="Location"
                                showSearch
                                options={inventoryPlaceOptions}
                            />
                        </Field>
                        <SaveFooter label="Save" busy={labelBusy} errorMessage="" />
                    </form>
                </Modal>
            )}
            {historyLabel && (
                <Modal
                    title={`Requests for ${inventoryLabelDisplayName(historyLabel)}`}
                    close={() => setHistoryLabel(null)}
                    className="w-[min(calc(100vw-2rem),45rem)]">
                    {historyLabelRequests.total > 0 ? (
                        <RelatedRequestBlocks
                            title="Inventory requests"
                            kind="inventory"
                            items={historyLabelRequests.items}
                            total={historyLabelRequests.total}
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
                        navigate(listPath, { replace: true });
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
                            navigate(
                                isLabels
                                    ? `${inventoryLabelsPath}/${encodeURIComponent(rowKeyOf(config, created))}`
                                    : inventoryTypePath(rowKeyOf(config, created)),
                                {
                                    replace: true,
                                },
                            );
                        }
                    }}
                />
            )}
        </MasterDetail>
    );
}
