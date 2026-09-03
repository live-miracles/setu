import { Tag, Typography } from 'antd';
import { PhoneOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { roleLabel } from './styles';
import { BlockCard } from './block-card';

export function UserBlock({
    user,
    dashboard,
    href,
    onClick,
}: {
    user: UserDTO;
    dashboard: DashboardPayload;
    href?: string;
    onClick?: () => void;
}) {
    const department = dashboard.departments.find((item) => item.Id === user.DepartmentId);
    return (
        <BlockCard className="user-card" href={href} onClick={onClick}>
            <div className="user-card-heading">
                <div className="user-card-identity">
                    <Typography.Text strong>{user.Name}</Typography.Text>
                    <Typography.Text type="secondary">
                        {user.Email} ·{' '}
                        {department?.ShortName || user.departmentName || 'No department'}
                    </Typography.Text>
                </div>
                <Tag color="blue">{roleLabel(user.Role)}</Tag>
            </div>
            <div className="user-card-contact">
                <span>
                    <PhoneOutlined /> {user.Phone || '—'}
                </span>
                <span>
                    <WhatsAppOutlined /> {user.Whatsapp || '—'}
                </span>
            </div>
        </BlockCard>
    );
}
