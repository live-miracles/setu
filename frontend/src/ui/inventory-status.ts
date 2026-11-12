import { ONGOING_INVENTORY_STATUSES } from '../../../supabase/functions/_shared/request-policy';

export function isOngoingInventoryRequest(request: Pick<InventoryRequest, 'Status'>): boolean {
    return ONGOING_INVENTORY_STATUSES.includes(request.Status);
}
