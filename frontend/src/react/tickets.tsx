import {
    Create,
    Datagrid,
    Edit,
    List,
    Show,
    SimpleForm,
    SimpleShowLayout,
    TextField,
    TextInput,
    TopToolbar,
    useDataProvider,
    useNotify,
    useRecordContext,
    useRefresh,
} from 'react-admin';

type TicketProvider = ReturnType<typeof useDataProvider> & {
    performTicketAction: (
        resource: string,
        params: { id: string; action: TicketAction; assigneeId: string | null; requestId: string },
    ) => Promise<unknown>;
};

function TicketActions() {
    const record = useRecordContext<TicketDTO>();
    const dataProvider = useDataProvider() as TicketProvider;
    const notify = useNotify();
    const refresh = useRefresh();
    if (!record) return null;

    const action = async (name: TicketAction, assigneeId: string | null = null) => {
        try {
            await dataProvider.performTicketAction('tickets', {
                id: record.Id,
                action: name,
                assigneeId,
                requestId: `react-${Date.now()}`,
            });
            notify('Ticket updated');
            refresh();
        } catch (error) {
            notify(error instanceof Error ? error.message : 'Ticket update failed', { type: 'error' });
        }
    };

    return (
        <TopToolbar>
            {record.Status !== 'closed' && (
                <button type="button" onClick={() => void action('close')}>Close</button>
            )}
            {record.Status === 'closed' && (
                <button type="button" onClick={() => void action('reopen')}>Reopen</button>
            )}
        </TopToolbar>
    );
}

function TicketList() {
    return (
        <List>
            <Datagrid rowClick="show">
                <TextField source="DisplayId" label="ID" />
                <TextField source="Title" />
                <TextField source="Status" />
                <TextField source="assigneeName" label="Assignee" />
            </Datagrid>
        </List>
    );
}

function TicketForm() {
    return (
        <SimpleForm>
            <TextInput source="Title" label="Title" required fullWidth />
            <TextInput source="Description" label="Description" multiline fullWidth />
        </SimpleForm>
    );
}

function TicketShow() {
    return (
        <Show actions={<TicketActions />}>
            <SimpleShowLayout>
                <TextField source="DisplayId" label="ID" />
                <TextField source="Title" />
                <TextField source="Description" />
                <TextField source="Status" />
                <TextField source="assigneeName" label="Assignee" />
            </SimpleShowLayout>
        </Show>
    );
}

export function TicketResource() {
    return {
        list: TicketList,
        create: () => <Create><TicketForm /></Create>,
        edit: () => <Edit><TicketForm /></Edit>,
        show: TicketShow,
    };
}
