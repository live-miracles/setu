import { useNavigate } from 'react-router-dom';
import { Empty, Tag, Typography } from '../ui/kit';
import { Icon } from '../ui/icons';
import { BlockCard } from '../ui/block-card';
import { RequestImage } from '../ui/request-image';
import { matchesSearch } from '../ui/search';
import { inventoryLabelPath } from '../paths';
import {
    groupInventoryLabels,
    inventoryLabelDisplayName,
    inventoryLabelLocationKey,
    inventoryQrValue,
    inventoryTypeDisplayName,
    type InventoryLabelGroupBy,
} from '../ui/inventory-qr';

const GROUP_BY_STORAGE_KEY = 'setu:inventory-labels-group-by';
export const LABEL_GROUP_BY_VALUES: InventoryLabelGroupBy[] = ['type', 'location'];

// The last chosen grouping is remembered in this browser; unavailable storage
// (private browsing) just falls back to the default.
export function readStoredLabelGroupBy(): InventoryLabelGroupBy {
    try {
        const stored = window.localStorage.getItem(GROUP_BY_STORAGE_KEY);
        return LABEL_GROUP_BY_VALUES.find((value) => value === stored) ?? 'type';
    } catch {
        return 'type';
    }
}

export function storeLabelGroupBy(value: InventoryLabelGroupBy): void {
    try {
        window.localStorage.setItem(GROUP_BY_STORAGE_KEY, value);
    } catch {
        // Not being able to remember the choice must not block changing it.
    }
}

// Every labelled unit as a compact card (type photo as a small avatar, details
// beside it), grouped by type or by location. The list half of the Labels
// view: InventoryTypesPage shows it beside the open type's details, and a card
// opens its type there with the clicked label marked.
export function InventoryLabelCards({
    types,
    groupBy,
    search,
    selectedLabelId,
    loading,
}: {
    types: InventoryTypeDTO[];
    groupBy: InventoryLabelGroupBy;
    search: string;
    selectedLabelId: string | null;
    loading: boolean;
}) {
    const navigate = useNavigate();
    if (loading) {
        return (
            <div className="py-8 text-center">
                <Typography.Text type="secondary">Loading…</Typography.Text>
            </div>
        );
    }
    const groups = groupInventoryLabels(types, groupBy)
        .map((group) => ({
            ...group,
            rows: group.rows.filter(({ type, label }) =>
                matchesSearch(search, [
                    inventoryLabelDisplayName(label),
                    inventoryTypeDisplayName(type),
                    inventoryLabelLocationKey(type, label),
                    inventoryQrValue(type, label),
                ]),
            ),
        }))
        .filter((group) => group.rows.length > 0);
    if (groups.length === 0) {
        return (
            <Empty
                description={search ? 'No labels match your search.' : 'No inventory labels yet.'}
            />
        );
    }
    return (
        <div className="grid grid-cols-1 gap-6">
            {groups.map((group) => (
                <section key={group.key}>
                    <div className="related-request-heading">
                        <Typography.Title level={3}>
                            {group.title} <Tag>{group.rows.length}</Tag>
                            {/* Grouped by type, the heading also says where the type is kept. */}
                            {groupBy === 'type' && group.rows[0].type.Location && (
                                <span className="block text-sm font-normal text-steel">
                                    {group.rows[0].type.Location}
                                </span>
                            )}
                        </Typography.Title>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-2">
                        {group.rows.map(({ type, label }) => {
                            const ownLocation = String(label.Location || '').trim();
                            const typeLocation = String(type.Location || '').trim();
                            const path = inventoryLabelPath(String(type.Id), label.Id);
                            return (
                                <BlockCard
                                    key={label.Id}
                                    href={path}
                                    selected={label.Id === selectedLabelId}
                                    onClick={() => navigate(path)}>
                                    <div className="flex items-center gap-3 p-2.5">
                                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink/5 text-steel">
                                            <RequestImage
                                                imageId={String(type.ImageId || '')}
                                                alt={inventoryTypeDisplayName(type)}
                                                className="size-full object-cover"
                                                fallback={<Icon name="box" />}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <strong className="block truncate">
                                                {inventoryLabelDisplayName(label)}
                                            </strong>
                                            {groupBy !== 'type' && (
                                                <span className="block truncate text-sm text-steel">
                                                    {inventoryTypeDisplayName(type) ||
                                                        'Unnamed equipment'}
                                                </span>
                                            )}
                                            {groupBy === 'type' && (
                                                <span className="block truncate text-sm text-steel">
                                                    {/* Only a place of the label's own that differs
                                                        from its type's; otherwise a dash, as in the
                                                        type's label table. */}
                                                    {ownLocation && ownLocation !== typeLocation
                                                        ? ownLocation
                                                        : '—'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="shrink-0 self-start text-xs text-steel">
                                            {inventoryQrValue(type, label)}
                                        </span>
                                    </div>
                                </BlockCard>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
