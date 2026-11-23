import { useOne } from '../ui/resources';
import { Typography } from '../ui/kit';
import { useNavigate } from 'react-router-dom';
import { DetailBackButton, DetailHeading } from '../ui/master-detail';
import { inventoryPath, programsPath } from '../paths';
import { InventoryDetail } from './inventory-detail';
import { ProgramDetail } from './program-detail';

// Rendered inside the request board's MasterDetail, so it returns the record's
// heading and sections only, not a page.
export function RequestDetail({ kind, id }: { kind: 'inventory' | 'programs'; id: string }) {
    const navigate = useNavigate();
    const resource = kind === 'inventory' ? 'inventory-requests' : 'program-requests';
    // Fetches this one record through the resource's own getOne operation
    // rather than finding it in a list: lists are paginated, so an older
    // request wouldn't be on the page even though it still exists.
    const { result: row, query } = useOne<InventoryRequestDTO | ProgramRequestDTO>({
        resource,
        id,
        // A missing/deleted record is a normal "not found" navigation state,
        // shown inline below rather than as an error toast.
    });
    const back = () =>
        navigate(kind === 'inventory' ? inventoryPath : programsPath, { replace: true });
    const listLabel = kind === 'inventory' ? 'Inventory requests' : 'Programs';
    if (query.isLoading) {
        return <Typography.Text type="secondary">Loading request…</Typography.Text>;
    }
    if (!row) {
        return (
            <>
                <DetailHeading
                    title="Not found"
                    actions={<DetailBackButton label={listLabel} onClick={back} />}
                />
                <Typography.Text type="secondary">Record not found.</Typography.Text>
            </>
        );
    }
    if (kind === 'inventory')
        return <InventoryDetail key={row.Id} request={row as InventoryRequestDTO} />;
    return <ProgramDetail key={row.Id} request={row as ProgramRequestDTO} />;
}
