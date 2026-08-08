import {
    ArrayField,
    ArrayInput,
    Create,
    Datagrid,
    Edit,
    EditButton,
    List,
    NumberField,
    NumberInput,
    SelectInput,
    Show,
    SimpleForm,
    SimpleFormIterator,
    SimpleShowLayout,
    TextField,
    TextInput,
    TopToolbar,
    useDataProvider,
    useNotify,
    useRecordContext,
    useRefresh,
} from 'react-admin';

type WorkflowProvider = ReturnType<typeof useDataProvider> & {
    performInventoryRequestAction: (resource: string, params: { id: string; action: InventoryRequestAction; note: string; returnItems: ReturnItemInput[] | null; requestId: string }) => Promise<unknown>;
    performProgramRequestAction: (resource: string, params: { id: string; action: ProgramRequestAction; note: string; requestId: string }) => Promise<unknown>;
};

function ActionToolbar({ kind }: { kind: 'inventory' | 'program' }) {
    const record = useRecordContext<{ Id: string; Status: string }>();
    const provider = useDataProvider() as WorkflowProvider;
    const notify = useNotify();
    const refresh = useRefresh();
    if (!record) return null;

    const actions = kind === 'inventory'
        ? (['submit', 'approve', 'reject', 'issue', 'return', 'cancel', 'close'] as InventoryRequestAction[])
        : (['submit', 'approve', 'reject', 'cancel'] as ProgramRequestAction[]);

    const run = async (action: InventoryRequestAction | ProgramRequestAction) => {
        try {
            if (kind === 'inventory') {
                await provider.performInventoryRequestAction('inventory-requests', {
                    id: record.Id,
                    action: action as InventoryRequestAction,
                    note: '',
                    returnItems: null,
                    requestId: `react-${Date.now()}`,
                });
            } else {
                await provider.performProgramRequestAction('program-requests', {
                    id: record.Id,
                    action: action as ProgramRequestAction,
                    note: '',
                    requestId: `react-${Date.now()}`,
                });
            }
            notify('Request updated');
            refresh();
        } catch (error) {
            notify(error instanceof Error ? error.message : 'Request update failed', { type: 'error' });
        }
    };

    return (
        <TopToolbar>
            {actions.map((action) => (
                <button key={action} type="button" onClick={() => void run(action)}>
                    {action}
                </button>
            ))}
        </TopToolbar>
    );
}

function InventoryList() {
    return <List><Datagrid rowClick="show"><TextField source="DisplayId" label="ID" /><TextField source="Name" /><TextField source="Status" /><TextField source="userName" label="Requester" /><TextField source="StartDate" /><TextField source="EndDate" /><EditButton /></Datagrid></List>;
}

function InventoryForm() {
    return <SimpleForm>
        <TextInput source="Name" label="Name" required fullWidth />
        <TextInput source="UserId" label="Requester email" required />
        <TextInput source="StartDate" label="From" type="date" required />
        <TextInput source="EndDate" label="To" type="date" required />
        <TextInput source="DepartmentId" label="Department id" required />
        <TextInput source="LeadEmail" label="Lead email" type="email" required />
        <TextInput source="Participants" label="Participants" />
        <ArrayInput source="Items" label="Equipment items" required><SimpleFormIterator>
            <TextInput source="InventoryTypeId" label="Inventory type id" required />
            <NumberInput source="Quantity" label="Quantity" min={1} required />
            <SelectInput source="Condition" label="Condition" choices={[{ id: '', name: 'Not returned' }, { id: 'good', name: 'Good' }, { id: 'damaged', name: 'Damaged' }, { id: 'missing', name: 'Missing' }]} />
        </SimpleFormIterator></ArrayInput>
    </SimpleForm>;
}

function InventoryShow() {
    return <Show actions={<ActionToolbar kind="inventory" />}><SimpleShowLayout>
        <TextField source="DisplayId" label="ID" /><TextField source="Name" /><TextField source="Status" /><TextField source="userName" label="Requester" /><TextField source="departmentName" label="Department" /><TextField source="StartDate" /><TextField source="EndDate" /><TextField source="LeadEmail" /><ArrayField source="items" label="Items"><Datagrid bulkActionButtons={false}><TextField source="itemName" label="Item" /><NumberField source="Quantity" /></Datagrid></ArrayField>
    </SimpleShowLayout></Show>;
}

function ProgramList() {
    return <List><Datagrid rowClick="show"><TextField source="DisplayId" label="ID" /><TextField source="Name" /><TextField source="Status" /><TextField source="userName" label="Requester" /><TextField source="Type" /><EditButton /></Datagrid></List>;
}

function ProgramForm() {
    return <SimpleForm>
        <TextInput source="Name" label="Title" />
        <TextInput source="Language" label="Language" required />
        <TextInput source="Type" label="Program type" required />
        <TextInput source="UserId" label="Requester email" required />
        <TextInput source="PlaceId" label="Place id" />
        <TextInput source="DepartmentId" label="Department id" required />
        <TextInput source="LeadEmail" label="Lead email" type="email" required />
        <TextInput source="Participants" label="Participants" />
        <ArrayInput source="Sessions" label="Sessions" required><SimpleFormIterator>
            <TextInput source="Name" label="Title" />
            <TextInput source="Type" label="Session type" required />
            <TextInput source="StartDateTime" label="Start" type="datetime-local" required />
            <TextInput source="EndDateTime" label="End" type="datetime-local" required />
        </SimpleFormIterator></ArrayInput>
    </SimpleForm>;
}

function ProgramShow() {
    return <Show actions={<ActionToolbar kind="program" />}><SimpleShowLayout>
        <TextField source="DisplayId" label="ID" /><TextField source="Name" /><TextField source="Status" /><TextField source="userName" label="Requester" /><TextField source="Language" /><TextField source="Type" /><TextField source="placeName" label="Place" /><ArrayField source="sessions" label="Sessions"><Datagrid bulkActionButtons={false}><TextField source="Name" /><TextField source="Type" /><TextField source="StartDateTime" /><TextField source="EndDateTime" /></Datagrid></ArrayField>
    </SimpleShowLayout></Show>;
}

export function InventoryResource() {
    return { list: InventoryList, create: () => <Create><InventoryForm /></Create>, edit: () => <Edit><InventoryForm /></Edit>, show: InventoryShow };
}

export function ProgramResource() {
    return { list: ProgramList, create: () => <Create><ProgramForm /></Create>, edit: () => <Edit><ProgramForm /></Edit>, show: ProgramShow };
}
