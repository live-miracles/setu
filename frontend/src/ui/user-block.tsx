import { Tag, Typography } from 'antd';
import { PhoneOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { roleLabel } from './styles';

export function UserBlock({
    user,
    dashboard,
    onClick,
}: {
    user: UserDTO;
    dashboard: DashboardPayload;
    onClick?: () => void;
}) {
    const department = dashboard.departments.find((item) => item.Id === user.DepartmentId);
    return (
        <article
            className="user-card"
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={
                onClick
                    ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onClick();
                          }
                      }
                    : undefined
            }>
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
        </article>
    );
}
