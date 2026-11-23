import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useDepartments, useInventoryTypes, useUsers } from '../ui/reference';
import { MultiSelect, Select, Field } from '../ui/form-kit';
import { Button, Empty, Space, Tag, Typography } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { inventoryPath, inventoryTypePath } from '../paths';
import { showErrorAlert } from '../ui/feedback';
import { inventoryShortageMessage } from '../ui/inventory-stock';
import {
    compareLabelNames,
    inventoryLabelDisplayName,
    inventoryTypeDisplayName,
    sortInventoryLabels,
} from '../ui/inventory-qr';
import {
    closeBlockedByMissingCondition,
    emptyItemDraft,
    itemDraftError,
    itemDraftOf,
    itemFromDraft,
    markItemReturned,
    missingReturnStatusMessage,
    removeItem,
    scanIntoItems,
    upsertItem,
    type ItemDraft,
} from '../ui/inventory-items';
import { uploadTargetImage } from '../ui/image-upload';
import { RequestImage } from '../ui/request-image';
import { QrScanner } from '../ui/qr-scanner';
import { ImageCamera } from '../ui/image-camera';
import { BlockCard } from '../ui/block-card';
import { TableView } from '../ui/table-view';
import { DetailSection } from '../ui/detail-layout';
import {
    buildInventoryUpdate,
    inventoryFormValues,
    type InventoryFormValues,
} from '../ui/request-fields';
import { isRequestOverdue } from '../workflows';
import { RequestDetailFrame } from './request-detail-frame';
import { useRequestDetail, type RequestDetailKind } from './use-request-detail';
import { ActionConfirmation } from './action-confirmation';
import { SaveFooter, TextField } from './form-fields';
import { requesterOptionLabel } from './requests';

const error = (value: unknown) => showErrorAlert(value);
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const inventoryKind: RequestDetailKind<InventoryRequestDTO, InventoryFormValues> = {
    policy: 'inventory',
    resource: 'inventory-requests',
    listPath: inventoryPath,
    listLabel: 'Inventory requests',
    noun: 'request',
    deleteSubject: 'inventory request',
    numberPrefix: 'REQ',
    perform: (id, action) =>
        api.performInventoryRequestAction(id, action as InventoryRequestAction, ''),
    saveParticipants: (id, participants) =>
        api.updateInventoryRequestParticipants(id, { participants }),
    formValues: inventoryFormValues,
    formUpdate: (request, values) => buildInventoryUpdate(request, { values }),
};

export function InventoryDetail({ request }: { request: InventoryRequestDTO }) {
    const navigate = useNavigate();
    const inventoryTypes = useInventoryTypes();
    const departments = useDepartments();
    const users = useUsers();
    const detail = useRequestDetail(inventoryKind, request);
    const { approver, permissions, form } = detail;
    const items = request.items;
    const imageId = request.ImageId || '';
    const showItemCondition = ['issued', 'closed'].includes(request.Status);
    const canEditItemCondition = approver && showItemCondition;
    const editable = permissions.canEdit;
    const [pendingDeleteItemIndex, setPendingDeleteItemIndex] = useState<number | null>(null);
    const [itemIndex, setItemIndex] = useState<number | null>(null);
    const [itemOpen, setItemOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [issueScanOpen, setIssueScanOpen] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [itemError, setItemError] = useState('');
    const [issueScanError, setIssueScanError] = useState('');
    const [imageUploading, setImageUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
    // Saves the item lines `change` returns for the newest copy of the request (null
    // saves nothing); returns false, with the reason shown, when the save failed.
    const persistItems = async (
        change: (items: InventoryItemDTO[]) => InventoryItemDTO[] | null,
    ): Promise<boolean> => {
        try {
            setItemError('');
            await detail.persist((latest) => {
                const next = change(latest.items);
                return next && buildInventoryUpdate(latest, { items: next });
            });
            return true;
        } catch (e) {
            setItemError(messageOf(e));
            return false;
        }
    };
    const scan = async (decodedValue: string, mode: 'request' | 'issue'): Promise<boolean> => {
        const refused: { reason?: 'not-found' | 'duplicate-label' } = {};
        const saved = await persistItems((current) => {
            const result = scanIntoItems(inventoryTypes, current, decodedValue, mode);
            if (result.ok) return result.items;
            refused.reason = result.reason;
            return null;
        });
        if (!refused.reason) return saved;
        const message =
            refused.reason === 'duplicate-label'
                ? 'This label was already added to the request.'
                : mode === 'issue'
                  ? 'Inventory type or label not found for this QR code.'
                  : 'Inventory type not found for this QR code.';
        if (mode === 'issue') setIssueScanError(message);
        else setItemError(message);
        return false;
    };
    const scanInventoryType = async (decodedValue: string): Promise<boolean> => {
        const saved = await scan(decodedValue, 'request');
        if (saved) setScanOpen(false);
        return saved;
    };
    const scanIssueItem = async (decodedValue: string) => {
        if (await scan(decodedValue, 'issue')) setIssueScanError('');
    };
    const editItem = (index: number | null) => {
        setItemIndex(index);
        setItemError('');
        setItemDraft(index === null ? emptyItemDraft() : itemDraftOf(items[index]));
        setItemOpen(true);
    };
    const saveItem = async (event: FormEvent) => {
        event.preventDefault();
        const message = itemDraftError(itemDraft, inventoryTypes);
        const type = inventoryTypes.find((entry) => entry.Id === itemDraft.InventoryTypeId);
        if (message || !type) {
            setItemError(message ?? '');
            return;
        }
        setItemError('');
        const index = itemIndex;
        setItemIndex(null);
        setItemOpen(false);
        await persistItems((current) => upsertItem(current, index, itemFromDraft(itemDraft, type)));
    };
    const selectedInventoryType = inventoryTypes.find(
        (type) => type.Id === itemDraft.InventoryTypeId,
    );
    const selectableInventoryTypes = inventoryTypes
        .filter(
            (type) =>
                approver || type.Requestable !== false || type.Id === itemDraft.InventoryTypeId,
        )
        .map((type) => ({ value: type.Id, label: inventoryTypeDisplayName(type) }))
        .sort((a, b) => compareLabelNames(a.label, b.label));
    const uploadRequestImage = async (file: File) => {
        if (!file) return;
        try {
            setImageUploading(true);
            const nextImageId = await uploadTargetImage(file, {
                type: 'inventory_request',
                id: request.Id,
            });
            await detail.persist((latest) =>
                buildInventoryUpdate(latest, { imageId: nextImageId }),
            );
        } catch (e) {
            error(e);
        } finally {
            setImageUploading(false);
        }
    };
    const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadRequestImage(file);
    };
    const formValues = form.values;
    return (
        <RequestDetailFrame
            request={request}
            detail={detail}
            title={request.Name || 'Unnamed request'}
            overdue={isRequestOverdue(request)}
            interceptAction={(action) => {
                if (action === 'issue') {
                    setIssueScanError('');
                    setIssueScanOpen(true);
                    return true;
                }
                if (action === 'close' && closeBlockedByMissingCondition(request.Status, items)) {
                    error(new Error(missingReturnStatusMessage));
                    return true;
                }
                return false;
            }}
            fields={[
                ['Request name', request.Name],
                ['Start date', request.StartDate],
                ['End date', request.EndDate],
            ]}
            modals={
                <>
                    {formValues && (
                        <Modal title="Edit inventory request" close={form.close}>
                            <form className="grid gap-3" noValidate onSubmit={form.save.run}>
                                <TextField
                                    name="name"
                                    label="Event / Purpose"
                                    value={formValues.Name}
                                    required
                                    onChange={(e) => form.update('Name', e.target.value)}
                                />
                                <TextField
                                    name="startDate"
                                    label="Start date"
                                    type="date"
                                    value={formValues.StartDate}
                                    required
                                    onChange={(e) => form.update('StartDate', e.target.value)}
                                />
                                <TextField
                                    name="endDate"
                                    label="End date"
                                    type="date"
                                    value={formValues.EndDate}
                                    required
                                    onChange={(e) => form.update('EndDate', e.target.value)}
                                />
                                {approver && (
                                    <Field label="Requested by" required>
                                        <input
                                            type="hidden"
                                            name="userId"
                                            value={formValues.UserId}
                                            required
                                        />
                                        <Select
                                            value={formValues.UserId}
                                            onChange={(value) => form.update('UserId', value)}
                                            className="w-full"
                                            showSearch>
                                            {users.map((user) => (
                                                <Select.Option key={user.Email} value={user.Email}>
                                                    {requesterOptionLabel(user)}
                                                </Select.Option>
                                            ))}
                                        </Select>
                                    </Field>
                                )}
                                <Field label="Department" required>
                                    <input
                                        type="hidden"
                                        name="departmentId"
                                        value={formValues.DepartmentId}
                                        required
                                    />
                                    <Select
                                        value={formValues.DepartmentId}
                                        onChange={(value) => form.update('DepartmentId', value)}
                                        className="w-full"
                                        showSearch>
                                        {departments.map((department) => (
                                            <Select.Option
                                                key={department.Id}
                                                value={department.Id}>
                                                {department.Name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Field>
                                <TextField
                                    name="leadEmail"
                                    label="Lead email"
                                    type="email"
                                    value={formValues.LeadEmail}
                                    required
                                    onChange={(e) => form.update('LeadEmail', e.target.value)}
                                />
                                <div>
                                    <SaveFooter
                                        label="Save"
                                        busy={form.save.busy}
                                        errorMessage={form.save.errorMessage}
                                    />
                                </div>
                            </form>
                        </Modal>
                    )}
                    {scanOpen && (
                        <Modal
                            title="Scan inventory type"
                            close={() => {
                                setScanOpen(false);
                                setItemError('');
                            }}>
                            <div className="grid gap-3">
                                <QrScanner onScan={scanInventoryType} stopOnScan manualEntry />
                                {itemError && (
                                    <Typography.Text type="danger">{itemError}</Typography.Text>
                                )}
                            </div>
                        </Modal>
                    )}
                    {issueScanOpen && (
                        <Modal title="Scan issued items" close={() => setIssueScanOpen(false)}>
                            <div className="grid gap-3">
                                <Typography.Text type="secondary">
                                    Scan each item. A labeled QR code adds its label without
                                    increasing the requested count; unlabeled codes only add a
                                    missing inventory type.
                                </Typography.Text>
                                <QrScanner onScan={scanIssueItem} manualEntry />
                                {issueScanError && (
                                    <Typography.Text type="danger">
                                        {issueScanError}
                                    </Typography.Text>
                                )}
                                <div className="flex justify-end">
                                    <Button
                                        type="primary"
                                        onClick={() => {
                                            setIssueScanOpen(false);
                                            detail.workflow.ask('issue');
                                        }}>
                                        Finish scanning
                                    </Button>
                                </div>
                            </div>
                        </Modal>
                    )}
                    {cameraOpen && (
                        <Modal title="Take photo" close={() => setCameraOpen(false)}>
                            <ImageCamera
                                onCapture={async (file) => {
                                    setCameraOpen(false);
                                    await uploadRequestImage(file);
                                }}
                            />
                        </Modal>
                    )}
                    {itemOpen && (
                        <Modal
                            title={itemIndex === null ? 'Add item' : 'Edit item'}
                            close={() => {
                                setItemOpen(false);
                                setItemIndex(null);
                            }}>
                            <form
                                className="inventory-item-form grid gap-3"
                                noValidate
                                onSubmit={saveItem}>
                                <Field label="Inventory type" required>
                                    <Select
                                        value={itemDraft.InventoryTypeId || undefined}
                                        onChange={(value) =>
                                            setItemDraft((current) => ({
                                                ...current,
                                                InventoryTypeId: value,
                                                LabelIds: [],
                                            }))
                                        }
                                        className="w-full"
                                        placeholder="Select inventory type"
                                        showSearch
                                        options={selectableInventoryTypes}
                                    />
                                    {selectedInventoryType && (
                                        <div className="inventory-type-detail-image mt-3">
                                            <RequestImage
                                                imageId={selectedInventoryType.ImageId}
                                                alt={inventoryTypeDisplayName(
                                                    selectedInventoryType,
                                                )}
                                                fallback={<span>No photo</span>}
                                            />
                                        </div>
                                    )}
                                </Field>
                                <TextField
                                    name="quantity"
                                    label="Quantity"
                                    type="number"
                                    value={itemDraft.Quantity}
                                    required
                                    onChange={(event) =>
                                        setItemDraft((current) => ({
                                            ...current,
                                            Quantity: Number(event.target.value),
                                        }))
                                    }
                                />
                                {approver && selectedInventoryType?.labels?.length ? (
                                    <Field label="Individual labels">
                                        <MultiSelect
                                            value={itemDraft.LabelIds}
                                            onChange={(value) =>
                                                setItemDraft((current) => ({
                                                    ...current,
                                                    LabelIds: value,
                                                    Quantity: Math.max(
                                                        current.Quantity,
                                                        value.length,
                                                    ),
                                                }))
                                            }
                                            className="w-full"
                                            placeholder="Select labels"
                                            options={sortInventoryLabels(
                                                selectedInventoryType.labels,
                                            ).map((label) => ({
                                                value: label.Id,
                                                label: inventoryLabelDisplayName(label),
                                            }))}
                                        />
                                    </Field>
                                ) : null}
                                {canEditItemCondition && (
                                    <Field label="Condition">
                                        <Select
                                            value={itemDraft.Condition}
                                            onChange={(value) =>
                                                setItemDraft((current) => ({
                                                    ...current,
                                                    Condition: value as ReturnCondition | '',
                                                }))
                                            }
                                            className="w-full">
                                            <Select.Option value="">Not specified</Select.Option>
                                            <Select.Option value="returned">Returned</Select.Option>
                                            <Select.Option value="damaged">Damaged</Select.Option>
                                            <Select.Option value="missing">Missing</Select.Option>
                                        </Select>
                                    </Field>
                                )}
                                <div>
                                    <SaveFooter label="Save" errorMessage={itemError} />
                                </div>
                            </form>
                        </Modal>
                    )}
                    {pendingDeleteItemIndex !== null && (
                        <ActionConfirmation
                            action="delete"
                            description="Are you sure you want to delete this item?"
                            onCancel={() => setPendingDeleteItemIndex(null)}
                            onConfirm={async () => {
                                await persistItems((current) =>
                                    removeItem(current, pendingDeleteItemIndex),
                                );
                                setPendingDeleteItemIndex(null);
                            }}
                        />
                    )}
                </>
            }>
            <DetailSection className="table-detail-section">
                <TableView
                    title="Requested items"
                    count={items.length}
                    action={
                        editable && (
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<Icon name="camera" />}
                                    onClick={() => {
                                        setItemError('');
                                        setScanOpen(true);
                                    }}
                                    aria-label="Scan requested item"
                                    title="Scan requested item"
                                />
                                <Button
                                    type="primary"
                                    icon={<Icon name="plus" />}
                                    onClick={() => editItem(null)}
                                    aria-label="Add item"
                                    title="Add item"
                                />
                            </Space>
                        )
                    }>
                    {items.length ? (
                        <div className="inventory-item-block-list">
                            {items.map((item, index) => {
                                const type = inventoryTypes.find(
                                    (entry) => entry.Id === item.InventoryTypeId,
                                );
                                const labels = (item.labels || [])
                                    .map((label) =>
                                        typeof label === 'string'
                                            ? inventoryLabelDisplayName(
                                                  type?.labels?.find(
                                                      (entry) => entry.Id === label,
                                                  ) ?? { Name: label, DisplayId: 0 },
                                              )
                                            : inventoryLabelDisplayName(label),
                                    )
                                    .sort(compareLabelNames);
                                const requestedOfType = items
                                    .filter(
                                        (entry) => entry.InventoryTypeId === item.InventoryTypeId,
                                    )
                                    .reduce((sum, entry) => sum + entry.Quantity, 0);
                                const shortageMessage = inventoryShortageMessage(
                                    request.Status,
                                    requestedOfType,
                                    type?.availableQuantity,
                                );
                                const conditionColor =
                                    item.Condition === 'returned'
                                        ? 'green'
                                        : item.Condition === 'damaged'
                                          ? 'orange'
                                          : item.Condition === 'missing'
                                            ? 'red'
                                            : 'default';
                                return (
                                    <BlockCard
                                        key={`${item.InventoryTypeId}-${index}`}
                                        className="inventory-item-block">
                                        <div className="inventory-item-block-heading">
                                            <div className="inventory-item-block-title">
                                                {showItemCondition && item.Condition && (
                                                    <Tag color={conditionColor}>
                                                        {item.Condition}
                                                    </Tag>
                                                )}
                                                <Typography.Text type="secondary">
                                                    Labels:{' '}
                                                    {labels.length ? labels.join(', ') : '—'}
                                                </Typography.Text>
                                            </div>
                                            <Space size="small">
                                                {type && (
                                                    <Button
                                                        type="text"
                                                        icon={<Icon name="eye" />}
                                                        onClick={() =>
                                                            navigate(inventoryTypePath(type.Id))
                                                        }
                                                        aria-label="View item type"
                                                        title="View item type"
                                                    />
                                                )}
                                                {canEditItemCondition &&
                                                    request.Status === 'issued' &&
                                                    item.Condition !== 'returned' && (
                                                        <Button
                                                            type="text"
                                                            icon={<Icon name="checkCircle" />}
                                                            onClick={() =>
                                                                void persistItems((current) =>
                                                                    markItemReturned(
                                                                        current,
                                                                        index,
                                                                    ),
                                                                )
                                                            }
                                                            aria-label="Mark item returned"
                                                            title="Mark item returned"
                                                        />
                                                    )}
                                                {editable && (
                                                    <>
                                                        <Button
                                                            type="text"
                                                            icon={<Icon name="edit" />}
                                                            onClick={() => editItem(index)}
                                                            aria-label="Edit item"
                                                        />
                                                        <Button
                                                            type="text"
                                                            danger
                                                            icon={<Icon name="trash" />}
                                                            onClick={() =>
                                                                setPendingDeleteItemIndex(index)
                                                            }
                                                            aria-label="Delete item"
                                                        />
                                                    </>
                                                )}
                                            </Space>
                                        </div>
                                        <div className="inventory-item-block-details">
                                            <Typography.Text type="secondary">
                                                {item.Quantity}×
                                            </Typography.Text>
                                            <Typography.Text strong>
                                                {item.itemName || 'Unknown item'}
                                            </Typography.Text>
                                            {shortageMessage && (
                                                <Typography.Text
                                                    type="warning"
                                                    className="basis-full">
                                                    {shortageMessage}
                                                </Typography.Text>
                                            )}
                                        </div>
                                    </BlockCard>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty>No items added.</Empty>
                    )}
                </TableView>
            </DetailSection>
            <DetailSection
                title="Image"
                className="inventory-image-section"
                action={
                    editable && (
                        <>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageFileChange}
                            />
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<Icon name="camera" />}
                                    loading={imageUploading}
                                    onClick={() => setCameraOpen(true)}
                                    aria-label={
                                        imageId ? 'Replace image with camera' : 'Take photo'
                                    }
                                    title={imageId ? 'Replace image with camera' : 'Take photo'}
                                />
                                <Button
                                    type="primary"
                                    icon={<Icon name="upload" />}
                                    loading={imageUploading}
                                    onClick={() => imageInputRef.current?.click()}
                                    aria-label={imageId ? 'Replace image' : 'Add image'}
                                    title={imageId ? 'Replace image' : 'Add image'}
                                />
                            </Space>
                        </>
                    )
                }>
                <div className="inventory-request-image-frame">
                    <RequestImage
                        imageId={imageId}
                        alt="Inventory request"
                        className="inventory-request-image"
                        fallback={
                            <Typography.Text type="secondary">No image added.</Typography.Text>
                        }
                    />
                </div>
            </DetailSection>
        </RequestDetailFrame>
    );
}
