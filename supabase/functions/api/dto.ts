import { inventoryLabelDto, locationFields, type Row } from './core.ts';
import { normalizeHiddenViews, normalizeViewOrder } from '../_shared/views.ts';

// Row -> DTO mappings for the reference data (the small, rarely-changing
// tables). Each entity is mapped here once; the list reads, the create/update
// results and the settings payload all use the same function, so a field added
// to a DTO appears everywhere it is returned.

export function timeDto(value: unknown): string {
    return value == null ? '' : String(value).slice(0, 5);
}

export function homeContentDto(row: Row): Row {
    return {
        Guidelines: row.guidelines,
        HiddenViews: normalizeHiddenViews(row.hidden_views),
        ViewOrder: normalizeViewOrder(row.view_order),
    };
}

export function departmentDto(x: Row): Row {
    return { Id: x.id, Name: x.name, ShortName: x.short_name, LeadEmail: x.lead_email };
}

// Places, inventory places and inventory brands: an id and a name.
export function placeDto(x: Row): Row {
    return { Id: x.id, Name: x.name };
}

export function shiftTypeDto(x: Row): Row {
    return {
        Id: x.id,
        Name: x.name,
        Color: x.color,
        DefaultStartTime: timeDto(x.default_start_time),
        DefaultEndTime: timeDto(x.default_end_time),
    };
}

export type NamedOptionTable = 'program_types' | 'program_languages' | 'session_types';

export function namedOptionDto(table: NamedOptionTable, row: Row): Row {
    return table === 'program_types' ? { Name: row.name, Color: row.color } : { Name: row.name };
}

// `availableQuantity` is what inventory_availability() reports for the type
// (the total when it reports nothing); `labels` are its inventory_type_labels
// rows read with their location.
export function inventoryTypeDto(
    row: Row,
    availableQuantity: number | undefined,
    labels: Row[],
): Row {
    return {
        Id: row.id,
        DisplayId: row.display_id,
        Brand: row.brand,
        Name: row.name,
        Model: row.model,
        ...locationFields(row),
        Description: row.description,
        Requestable: row.requestable,
        ImageId: row.image_path,
        TotalQuantity: row.total_quantity,
        availableQuantity: availableQuantity ?? row.total_quantity,
        labels: labels.map(inventoryLabelDto),
    };
}
