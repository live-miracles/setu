import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SegmentedControl, Typography } from './kit';
import {
    INVENTORY_KINDS,
    inventoryKindLabel,
    inventoryKindPath,
    visibleInventoryKinds,
    writeLastInventoryKind,
    type InventoryKind,
} from './inventory-kind';
import type { ViewSettings } from './views';

// The page heading of both inventory pages: the Types / Labels switch, or just
// a title when an admin hid the other kind (the open kind is always offered,
// since a link can open a hidden one).
export function InventoryKindHeading({
    kind,
    homeContent,
}: {
    kind: InventoryKind;
    homeContent: ViewSettings;
}) {
    const navigate = useNavigate();
    useEffect(() => writeLastInventoryKind(kind), [kind]);
    const visible = visibleInventoryKinds(homeContent);
    const kinds = INVENTORY_KINDS.filter((value) => value === kind || visible.includes(value));
    if (kinds.length < 2) {
        return <Typography.Title level={2}>Inventory {inventoryKindLabel(kind)}</Typography.Title>;
    }
    return (
        <>
            <h2 className="sr-only">Inventory</h2>
            <SegmentedControl
                aria-label="Inventory view"
                value={kind}
                options={kinds.map((value) => ({ value, label: inventoryKindLabel(value) }))}
                onChange={(value) => navigate(inventoryKindPath(value))}
            />
        </>
    );
}
