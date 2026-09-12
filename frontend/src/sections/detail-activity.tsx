import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Input, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { useDashboard } from '../dashboard-context';
import { formatDateTime } from '../ui/format';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { Empty, Modal, SaveFooter, TextField } from './refine-shared';

const error = (value: unknown) => showErrorAlert(value);
const PARTICIPANT_EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export function Activity({
    requestId,
    initialComments,
}: {
    requestId: string;
    initialComments: CommentDTO[];
}) {
    const { refreshDashboard } = useDashboard();
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<CommentDTO[]>(initialComments);
    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = comment.trim();
        if (!trimmed) return;
        setComment('');
        try {
            showSavingBadge(true);
            const added = await api.addComment(requestId, trimmed, generateRequestId());
            setComments((current) => [...current, added]);
            // The dashboard's cached request lists aren't patched with the new
            // comment, so a later visit would show the request without it until
            // this quiet refresh catches it up.
            void refreshDashboard().catch(() => undefined);
        } catch (e) {
            setComment(trimmed);
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    return (
        <div className="activity-card">
            <Card title="Activity">
                <div className="activity-comments space-y-3">
                    {comments.length ? (
                        comments.map((c) => (
                            <div
                                className="border-b border-gray-200 pb-2 text-sm last:border-0"
                                key={c.Id}>
                                <div className="font-medium">
                                    {c.userName}{' '}
                                    <span className="ml-2 text-xs font-normal text-black/50">
                                        {formatDateTime(c.Timestamp)}
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap text-black/70">{c.Message}</p>
                            </div>
                        ))
                    ) : (
                        <Empty>No activity yet.</Empty>
                    )}
                </div>
                <form className="flex items-end gap-2" onSubmit={submit}>
                    <Input.TextArea
                        size="small"
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                            }
                        }}
                        placeholder="Add a comment"
                    />
                    <Button size="small" htmlType="submit">
                        Send
                    </Button>
                </form>
            </Card>
        </div>
    );
}

export function ParticipantsEditor({
    participants,
    editable,
    onSave,
}: {
    participants: string[];
    editable: boolean;
    onSave: (participants: string[]) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const normalizedParticipants = participants.map((participant) => participant.toLowerCase());
    const addParticipant = async (event: FormEvent) => {
        event.preventDefault();
        if (!(event.currentTarget as HTMLFormElement).checkValidity()) return;
        const nextEmail = email.trim().toLowerCase();
        if (!PARTICIPANT_EMAIL_PATTERN.test(nextEmail)) {
            setErrorMessage('Enter a valid email address.');
            return;
        }
        if (normalizedParticipants.includes(nextEmail)) {
            setErrorMessage('That email is already a participant.');
            return;
        }
        setBusy(true);
        setErrorMessage('');
        try {
            await onSave([...normalizedParticipants, nextEmail]);
            setEmail('');
            setOpen(false);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };
    const removeParticipant = async (participant: string) => {
        setBusy(true);
        setErrorMessage('');
        try {
            await onSave(normalizedParticipants.filter((entry) => entry !== participant));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-2">
            {normalizedParticipants.map((participant) => (
                <Tag
                    key={participant}
                    closable={editable && !busy}
                    onClose={(event) => {
                        event.preventDefault();
                        void removeParticipant(participant);
                    }}>
                    {participant}
                </Tag>
            ))}
            {editable && (
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={busy}
                    aria-label="Add participant"
                    title="Add participant"
                    onClick={() => {
                        setErrorMessage('');
                        setOpen(true);
                    }}
                />
            )}
            {!normalizedParticipants.length && !editable && <Typography.Text>None</Typography.Text>}
            {errorMessage && (
                <Typography.Text type="danger" className="basis-full text-sm">
                    {errorMessage}
                </Typography.Text>
            )}
            {open && (
                <Modal title="Add participant" close={() => setOpen(false)}>
                    <form className="grid gap-3" onSubmit={addParticipant}>
                        <TextField
                            name="participantEmail"
                            label="Email"
                            type="email"
                            value={email}
                            required
                            onChange={(event) => setEmail(event.target.value)}
                        />
                        <SaveFooter label="Add" busy={busy} errorMessage={errorMessage} />
                    </form>
                </Modal>
            )}
        </div>
    );
}
