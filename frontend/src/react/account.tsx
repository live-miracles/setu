import { Edit, List, SimpleForm, TextField, TextInput } from 'react-admin';

export function ProfileList() {
    return <List resource="profile"><TextField source="Name" /><TextField source="Email" /><TextField source="Phone" /></List>;
}

export function ProfileEdit() {
    return <Edit resource="profile" id="current"><SimpleForm>
        <TextInput source="Name" label="Name" required />
        <TextInput source="DepartmentId" label="Department id" />
        <TextInput source="Phone" label="Phone" required />
        <TextInput source="Whatsapp" label="WhatsApp" />
    </SimpleForm></Edit>;
}

export function HomeContentList() {
    return <List resource="home-content"><TextField source="SupportMessage" /><TextField source="Guidelines" /></List>;
}

export function HomeContentEdit() {
    return <Edit resource="home-content" id="content"><SimpleForm>
        <TextInput source="SupportMessage" label="Support message" multiline fullWidth />
        <TextInput source="Guidelines" label="Guidelines" multiline fullWidth />
        <TextInput source="WhatsappUrl" label="WhatsApp URL" type="url" />
        <TextInput source="TutorialUrl" label="Tutorial URL" type="url" />
        <TextInput source="NotificationEmail" label="Notification email" type="email" />
    </SimpleForm></Edit>;
}
