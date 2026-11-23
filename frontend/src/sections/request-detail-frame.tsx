import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Space, Tag } from '../ui/kit';
import { Icon } from '../ui/icons';
import { DetailSection } from '../ui/detail-layout';
import { DetailBackButton } from '../ui/master-detail';
import { requestStatusTagColor } from '../ui/request-status';
import { departmentPath, userPath } from '../paths';
import { Activity, ParticipantsEditor } from './detail-activity';
import { DetailFields, DetailLayout, DetailLink, WorkflowActions } from './detail-shared';
import { ActionConfirmation } from './action-confirmation';
import type { RequestDetailView } from './use-request-detail';

// The screen both kinds of request share: the heading with its Workflow
// actions, the Details card, the Activity card and the confirmations. Each kind
// brings its own fields and sections (and its own edit form, as `modals`).
export function RequestDetailFrame({
    request,
    detail,
    title,
    fields,
    overdue = false,
    headerExtra,
    interceptAction,
    editDisabled = false,
    modals,
    children,
}: {
    request: InventoryRequestDTO | ProgramRequestDTO;
    detail: RequestDetailView;
    title: string;
    // The kind's own Details rows, between the status and the department.
    fields: Array<[label: string, value: ReactNode]>;
    overdue?: boolean;
    // Buttons between Back and the Workflow actions (Duplicate, Reschedule).
    headerExtra?: ReactNode;
    // Lets a kind handle a Workflow action itself (issuing scans first); return true when it did.
    interceptAction?: (action: string) => boolean;
    editDisabled?: boolean;
    // The kind's own sections, between Details and Activity.
    children: ReactNode;
    // The kind's edit form and other overlays.
    modals?: ReactNode;
}) {
    const navigate = useNavigate();
    const { kind, approver, permissions } = detail;
    const actions = permissions.actions;
    return (
        <DetailLayout
            title={title}
            action={
                <Space wrap>
                    <DetailBackButton
                        label={kind.listLabel}
                        onClick={() => navigate(kind.listPath, { replace: true })}
                    />
                    {headerExtra}
                    {actions.length > 0 && (
                        <WorkflowActions
                            actions={actions}
                            onAction={(action) => {
                                if (!interceptAction?.(action)) detail.workflow.ask(action);
                            }}
                        />
                    )}
                    {permissions.canDelete && (
                        <Button
                            type="primary"
                            danger
                            icon={<Icon name="trash" />}
                            onClick={detail.remove.ask}
                            aria-label={`Delete ${kind.noun}`}
                            title={`Delete ${kind.noun}`}
                        />
                    )}
                </Space>
            }>
            <DetailSection
                title="Details"
                action={
                    permissions.canEdit && (
                        <Button
                            type="primary"
                            icon={<Icon name="edit" />}
                            disabled={editDisabled}
                            onClick={detail.form.open}
                            aria-label={`Edit ${kind.noun}`}
                            title={`Edit ${kind.noun}`}
                        />
                    )
                }>
                <DetailFields
                    fields={[
                        ['Request number', `${kind.numberPrefix}-${request.DisplayId}`],
                        [
                            'Status',
                            <Tag
                                color={requestStatusTagColor(request.Status, overdue)}
                                key="status">
                                {request.Status}
                            </Tag>,
                        ],
                        ...fields,
                        [
                            'Department',
                            request.DepartmentId ? (
                                <DetailLink
                                    to={departmentPath(request.DepartmentId)}
                                    enabled={approver}>
                                    {request.departmentName}
                                </DetailLink>
                            ) : (
                                'None'
                            ),
                        ],
                        ['Lead email', request.LeadEmail],
                        [
                            'Requested by',
                            request.UserId ? (
                                <DetailLink to={userPath(request.UserId)} enabled={approver}>
                                    {request.userName || 'Unknown'}
                                </DetailLink>
                            ) : (
                                'Unknown'
                            ),
                        ],
                        [
                            'Participants',
                            <ParticipantsEditor
                                participants={request.participants}
                                editable={permissions.canCollaborate}
                                onSave={detail.saveParticipants}
                            />,
                        ],
                    ]}
                />
            </DetailSection>
            {children}
            <DetailSection className="activity-detail-section">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {detail.workflow.pending && (
                <ActionConfirmation
                    action={detail.workflow.pending}
                    onCancel={detail.workflow.cancel}
                    onConfirm={async () => detail.workflow.confirm()}
                />
            )}
            {detail.remove.pending && (
                <ActionConfirmation
                    action="delete"
                    description={`Are you sure you want to delete this ${kind.deleteSubject}?`}
                    onCancel={detail.remove.cancel}
                    onConfirm={detail.remove.confirm}
                />
            )}
            {modals}
        </DetailLayout>
    );
}
