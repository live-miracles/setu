import { Create, Datagrid, Edit, List, SimpleForm, TextField, TextInput } from 'react-admin';

function RosterList() {
    return <List><Datagrid rowClick="edit"><TextField source="Name" /><TextField source="StartDate" /><TextField source="EndDate" /><TextField source="StartTime" /><TextField source="EndTime" /><TextField source="UserId" label="Assigned user" /></Datagrid></List>;
}

function RosterForm() {
    return <SimpleForm>
        <TextInput source="Name" label="Shift name" required />
        <TextInput source="StartDate" label="Start date" type="date" required />
        <TextInput source="EndDate" label="End date" type="date" required />
        <TextInput source="StartTime" label="Start time" type="time" required />
        <TextInput source="EndTime" label="End time" type="time" required />
        <TextInput source="UserId" label="Assigned user email" type="email" required />
    </SimpleForm>;
}

export function RosterResource() {
    return {
        list: RosterList,
        create: () => <Create><RosterForm /></Create>,
        edit: () => <Edit><RosterForm /></Edit>,
    };
}
