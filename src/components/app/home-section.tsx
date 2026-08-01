'use client';

import {
    ArrowRightOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExportOutlined,
    InboxOutlined,
    LinkOutlined,
    PlayCircleOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
    ToolOutlined,
    WarningOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag } from 'antd';
import { format, formatISO, isSameDay } from 'date-fns';
import { useState } from 'react';
import type { SectionKey } from './workspace-app';
import { StatusTag } from './shared';
import { useDemoStore } from '@/demo/store';

const rosterStart = (roster: { startDate: string; startTime: string }) =>
    new Date(`${roster.startDate}T${roster.startTime}`);
const rosterEnd = (roster: { endDate: string; endTime: string }) =>
    new Date(`${roster.endDate}T${roster.endTime}`);

export function HomeSection({ onNavigate }: { onNavigate: (section: SectionKey) => void }) {
    const { state } = useDemoStore();
    const [renderedAt] = useState(() => Date.now());
    const today = formatISO(new Date(), { representation: 'date' });

    const nextRoster = [...state.rosters]
        .filter((roster) => rosterEnd(roster).getTime() > renderedAt)
        .sort((a, b) => rosterStart(a).getTime() - rosterStart(b).getTime())[0];
    const todayRosters = state.rosters.filter((roster) => isSameDay(rosterStart(roster), new Date()));

    const pendingInventoryRequests = state.inventoryRequests.filter((request) =>
        ['submitted', 'approved', 'issued'].includes(request.status),
    );
    const pendingProgramRequests = state.programRequests.filter((request) =>
        ['submitted', 'approved'].includes(request.status),
    );
    const combinedRequests = [
        ...pendingInventoryRequests.map((request) => ({
            key: `inv-${request.id}`,
            label: `REQ-${request.displayId}`,
            name: request.name,
            status: request.status,
            overdue: request.status === 'issued' && request.endDate < today,
        })),
        ...pendingProgramRequests.map((request) => ({
            key: `prg-${request.id}`,
            label: `PRG-${request.displayId}`,
            name: request.name,
            status: request.status,
            overdue: false,
        })),
    ];

    const openTickets = state.tickets.filter((ticket) => ticket.status !== 'closed');
    const lowStock = state.inventoryTypes.filter(
        (type) => type.availableQuantity / type.totalQuantity <= 0.3,
    );

    return (
        <>
            <section className="hero">
                <div>
                    <p className="eyebrow">Live operations · today</p>
                    <h2>Everything ready for the next broadcast.</h2>
                    <p className="hero-copy">{state.homeContent.supportMessage}</p>
                    <div className="hero-actions">
                        <Button
                            type="primary"
                            icon={<InboxOutlined />}
                            onClick={() => onNavigate('inventory')}>
                            Request equipment
                        </Button>
                        <Button
                            ghost
                            icon={<CalendarOutlined />}
                            onClick={() => onNavigate('roster')}>
                            View roster
                        </Button>
                    </div>
                </div>
                {nextRoster && (
                    <div className="hero-shift">
                        <span className="hero-shift-label">Your next shift</span>
                        <h3>
                            {nextRoster.name} · {format(rosterStart(nextRoster), 'h:mm a')}
                        </h3>
                        <p>
                            {format(rosterStart(nextRoster), 'EEE, d MMM')} · {nextRoster.user.name}
                        </p>
                    </div>
                )}
            </section>

            <div className="section-grid metrics">
                <MetricCard
                    label="Today’s roster"
                    value={todayRosters.length}
                    note={[...new Set(todayRosters.map((roster) => roster.name))].join(', ') || 'No entries'}
                    icon={<TeamOutlined />}
                />
                <MetricCard
                    label="Active requests"
                    value={combinedRequests.length}
                    note={`${pendingInventoryRequests.length} inventory · ${pendingProgramRequests.length} program`}
                    icon={<ClockCircleOutlined />}
                />
                <MetricCard
                    label="Open tickets"
                    value={openTickets.length}
                    note={`${openTickets.filter((ticket) => ticket.status === 'unassigned').length} unassigned`}
                    icon={<ToolOutlined />}
                />
                <MetricCard
                    label="Low stock"
                    value={lowStock.length}
                    note="Items below 30% availability"
                    icon={<WarningOutlined />}
                />
            </div>

            <div className="section-grid two">
                <Card className="surface-card">
                    <div className="card-heading">
                        <div>
                            <h3>Ongoing roster</h3>
                            <p>Today and tomorrow at a glance</p>
                        </div>
                        <Button
                            type="text"
                            icon={<ArrowRightOutlined />}
                            onClick={() => onNavigate('roster')}
                        />
                    </div>
                    {state.rosters.slice(0, 4).map((roster) => (
                        <div className="schedule-row" key={roster.id}>
                            <div className="date-tile">
                                <strong>{format(rosterStart(roster), 'dd')}</strong>
                                <span>{format(rosterStart(roster), 'MMM')}</span>
                            </div>
                            <div>
                                <p className="row-title">
                                    {roster.name} · {format(rosterStart(roster), 'h:mm a')}
                                </p>
                                <p className="row-meta">{roster.user.name}</p>
                            </div>
                            <Tag color="gold">
                                {roster.startTime}–{roster.endTime}
                            </Tag>
                        </div>
                    ))}
                </Card>

                <Card className="surface-card">
                    <div className="card-heading">
                        <div>
                            <h3>Requests</h3>
                            <p>Items that still need attention</p>
                        </div>
                        <Button
                            type="text"
                            icon={<ArrowRightOutlined />}
                            onClick={() => onNavigate('inventory')}
                        />
                    </div>
                    {combinedRequests.map((request) => (
                        <div className="request-row" key={request.key}>
                            <div>
                                <span className="request-id">{request.label}</span>
                                <h4>{request.name}</h4>
                            </div>
                            <div className="request-actions">
                                {request.overdue && (
                                    <Tag color="error" variant="filled">
                                        Overdue
                                    </Tag>
                                )}
                                <StatusTag status={request.status} />
                            </div>
                        </div>
                    ))}
                </Card>
            </div>

            <div className="section-grid two">
                <Card className="surface-card">
                    <div className="card-heading">
                        <div>
                            <h3>Quick links</h3>
                            <p>Frequently used operations tools</p>
                        </div>
                        <LinkOutlined />
                    </div>
                    <div className="quick-links">
                        {state.links.map((link) => (
                            <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="link-row">
                                <span className="link-icon">
                                    <ExportOutlined />
                                </span>
                                <span>{link.name}</span>
                            </a>
                        ))}
                    </div>
                </Card>

                <Card className="surface-card">
                    <div className="card-heading">
                        <div>
                            <h3>Studio essentials</h3>
                            <p>Keep every session safe and smooth</p>
                        </div>
                        <SafetyCertificateOutlined />
                    </div>
                    <p
                        style={{
                            margin: '0 0 20px',
                            color: '#6f7279',
                            fontSize: 13,
                            lineHeight: 1.7,
                        }}>
                        {state.homeContent.guidelines}
                    </p>
                    <Space wrap>
                        <Button
                            icon={<WhatsAppOutlined />}
                            href={state.homeContent.whatsappUrl}
                            target="_blank">
                            Support chat
                        </Button>
                        <Button
                            icon={<PlayCircleOutlined />}
                            href={state.homeContent.tutorialUrl}
                            target="_blank">
                            Booking tutorial
                        </Button>
                    </Space>
                </Card>
            </div>
        </>
    );
}

function MetricCard({
    label,
    value,
    note,
    icon,
}: {
    label: string;
    value: number;
    note: string;
    icon: React.ReactNode;
}) {
    return (
        <Card className="metric-card">
            <div className="metric-top">
                <span>{label}</span>
                <span className="metric-icon">{icon}</span>
            </div>
            <div className="metric-value">{value}</div>
            <div className="metric-note">
                <CheckCircleOutlined style={{ marginRight: 5, color: '#58a384' }} />
                {note}
            </div>
        </Card>
    );
}
