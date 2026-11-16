import { Tag, Typography } from '../ui/kit';
import { Icon } from '../ui/icons';
import { roleLabel } from './styles';
import { BlockCard } from './block-card';

export function UserBlock({
    user,
    dashboard,
    href,
    onClick,
    selected,
}: {
    user: UserDTO;
    dashboard: DashboardPayload;
    href?: string;
    onClick?: () => void;
    selected?: boolean;
}) {
    const department = dashboard.departments.find((item) => item.Id === user.DepartmentId);
    const departmentName = department?.ShortName || user.departmentName;
    return (
        <BlockCard className="user-card" href={href} onClick={onClick} selected={selected}>
            <div className="user-card-heading">
                <div className="user-card-identity">
                    <Typography.Text strong>{user.Name}</Typography.Text>
                    <Typography.Text type="secondary">
                        {user.Email}
                        {departmentName && <> · {departmentName}</>}
                    </Typography.Text>
                </div>
                <Tag color="blue">{roleLabel(user.Role)}</Tag>
            </div>
            <div className="user-card-contact">
                <span>
                    <Icon name="phone" /> {user.Phone || '—'}
                </span>
                <span>
                    <Icon name="whatsapp" /> {user.Whatsapp || '—'}
                </span>
            </div>
        </BlockCard>
    );
}
