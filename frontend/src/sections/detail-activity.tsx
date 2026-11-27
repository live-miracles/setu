import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TextArea } from '../ui/form-kit';
import { Button, Card, Empty, Tag, Typography } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { useInvalidate } from '../ui/resources';
import { useMe } from '../ui/reference';
import { formatDateTime } from '../ui/format';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { canWrite } from '../workflows';
import { EditEventRow, StatusEventRow } from './activity-events';
import { SaveFooter, TextField } from './form-fields';

const error = (value: unknown) => showErrorAlert(value);
const PARTICIPANT_EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export function Activity({
    requestId,
    initialComments,
}: {
    requestId: string;
    initialComments: CommentDTO[];
}) {
    const invalidate = useInvalidate();
    const canComment = canWrite(useMe());
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<CommentDTO[]>(initialComments);
    const commentsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);
    useEffect(() => {
        const el = commentsRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [comments]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = comment.trim();
        if (!trimmed) return;
        setComment('');
        try {
            showSavingBadge(true);
            const added = await api.addComment(requestId, trimmed, generateRequestId());
            setComments((current) => [...current, added]);
            // The home screen's latest comments aren't patched with the new
            // one; this quiet refresh catches them up.
            void invalidate({ resource: 'dashboard' }).catch(() => undefined);
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
                <div className="activity-comments space-y-3" ref={commentsRef}>
                    {comments.length ? (
                        comments.map((c) =>
                            c.Kind === 'status' ? (
                                <StatusEventRow comment={c} key={c.Id} />
                            ) : c.Kind === 'edit' ? (
                                <EditEventRow comment={c} key={c.Id} />
                            ) : (
                                <div
                                    className="border-b border-line pb-2 text-sm last:border-0"
                                    key={c.Id}>
                                    <div className="font-medium">
                                        {c.userName}{' '}
                                        <span className="ml-2 text-xs font-normal text-steel">
                                            {formatDateTime(c.Timestamp)}
                                        </span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-ink/70">{c.Message}</p>
                                </div>
                            ),
                        )
                    ) : (
                        <Empty>No activity yet.</Empty>
                    )}
                </div>
                {canComment ? (
                    <form className="flex items-end gap-2" onSubmit={submit}>
                        <TextArea
                            size="small"
                            autoSize={{ minRows: 1, maxRows: 6 }}
                            value={comment}
                            aria-label="Add a comment"
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
                ) : (
                    <Typography.Text type="secondary">Viewer access is read-only.</Typography.Text>
                )}
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
        setErrorMessage('');
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
                    icon={<Icon name="plus" />}
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
