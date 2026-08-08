import {
    Admin,
    Create,
    Datagrid,
    DateField,
    DateInput,
    Edit,
    List,
    NumberField,
    NumberInput,
    Resource,
    SimpleForm,
    TextField,
    TextInput,
    SelectInput,
} from 'react-admin';
import { dataProvider } from './data-provider';
import { TicketResource } from './tickets';
import { InventoryResource, ProgramResource } from './requests';
import { RosterResource } from './roster';
import { authProvider } from './auth-provider';
import { Dashboard } from './dashboard';
import { HomeContentEdit, HomeContentList, ProfileEdit, ProfileList } from './account';

function NamedList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
            </Datagrid>
        </List>
    );
}

function NamedForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
        </SimpleForm>
    );
}

function DepartmentList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
                <TextField source="ShortName" label="Short name" />
                <TextField source="LeadEmail" label="Lead email" />
            </Datagrid>
        </List>
    );
}

function UserList() {
    return <List><Datagrid rowClick="edit"><TextField source="Name" /><TextField source="Email" /><TextField source="Role" /><TextField source="departmentName" label="Department" /><TextField source="Phone" /></Datagrid></List>;
}

function UserForm() {
    return <SimpleForm>
        <TextInput source="Email" type="email" required />
        <TextInput source="Name" required />
        <SelectInput source="Role" required choices={[{ id: 'admin', name: 'Admin' }, { id: 'approver', name: 'Approver' }, { id: 'viewer', name: 'Viewer' }, { id: 'user', name: 'User' }]} />
        <TextInput source="DepartmentId" label="Department id" />
        <TextInput source="Phone" required />
        <TextInput source="Whatsapp" />
    </SimpleForm>;
}

function DepartmentForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
            <TextInput source="ShortName" label="Short name" />
            <TextInput source="LeadEmail" label="Lead email" type="email" />
        </SimpleForm>
    );
}

function InventoryTypeList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
                <TextField source="Description" label="Description" />
                <NumberField source="TotalQuantity" label="Total quantity" />
                <NumberField source="availableQuantity" label="Available" />
            </Datagrid>
        </List>
    );
}

function InventoryTypeForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
            <TextInput source="Description" label="Description" multiline />
            <NumberInput source="TotalQuantity" label="Total quantity" min={0} required />
        </SimpleForm>
    );
}

function LinkList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
                <TextField source="Url" label="URL" />
            </Datagrid>
        </List>
    );
}

function LinkForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
            <TextInput source="Url" label="URL" type="url" required />
        </SimpleForm>
    );
}

function ShiftPresetList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
                <TextField source="DefaultStartTime" label="Start" />
                <TextField source="DefaultEndTime" label="End" />
            </Datagrid>
        </List>
    );
}

function ShiftPresetForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
            <TextInput source="DefaultStartTime" label="Start" type="time" />
            <TextInput source="DefaultEndTime" label="End" type="time" />
        </SimpleForm>
    );
}

function BlockList() {
    return (
        <List>
            <Datagrid rowClick="edit">
                <TextField source="Name" label="Name" />
                <DateField source="StartDateTime" label="Start" showTime />
                <DateField source="EndDateTime" label="End" showTime />
                <TextField source="Place" label="Place" />
            </Datagrid>
        </List>
    );
}

function BlockForm() {
    return (
        <SimpleForm>
            <TextInput source="Name" label="Name" required />
            <DateInput source="StartDateTime" label="Start" required />
            <DateInput source="EndDateTime" label="End" required />
            <TextInput source="Place" label="Place id" />
        </SimpleForm>
    );
}

function ResourceForms({
    list,
    form,
}: {
    list: () => JSX.Element;
    form: () => JSX.Element;
}) {
    return { list, create: () => <Create>{form()}</Create>, edit: () => <Edit>{form()}</Edit> };
}

export function SettingsApp() {
    const named = ResourceForms({ list: NamedList, form: NamedForm });
    const department = ResourceForms({ list: DepartmentList, form: DepartmentForm });
    const user = ResourceForms({ list: UserList, form: UserForm });
    const inventoryType = ResourceForms({ list: InventoryTypeList, form: InventoryTypeForm });
    const link = ResourceForms({ list: LinkList, form: LinkForm });
    const shiftPreset = ResourceForms({ list: ShiftPresetList, form: ShiftPresetForm });
    const block = ResourceForms({ list: BlockList, form: BlockForm });
    const ticket = TicketResource();
    const inventory = InventoryResource();
    const program = ProgramResource();
    const roster = RosterResource();

    return (
        <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard} basename="/">
            <Resource name="users" {...user} />
            <Resource name="profile" list={ProfileList} edit={ProfileEdit} />
            <Resource name="home-content" list={HomeContentList} edit={HomeContentEdit} />
            <Resource name="departments" {...department} />
            <Resource name="places" {...named} />
            <Resource name="inventory-types" {...inventoryType} />
            <Resource name="links" {...link} />
            <Resource name="shift-presets" {...shiftPreset} />
            <Resource name="program-types" {...named} />
            <Resource name="program-languages" {...named} />
            <Resource name="session-types" {...named} />
            <Resource name="blocks" {...block} />
            <Resource name="tickets" {...ticket} />
            <Resource name="inventory-requests" {...inventory} />
            <Resource name="program-requests" {...program} />
            <Resource name="rosters" {...roster} />
        </Admin>
    );
}
