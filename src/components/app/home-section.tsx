"use client";

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
} from "@ant-design/icons";
import { Avatar, Button, Card, Space, Tag } from "antd";
import { format, isSameDay } from "date-fns";
import { useState } from "react";
import type { SectionKey } from "./workspace-app";
import { StatusTag, initials } from "./shared";
import { useDemoStore } from "@/demo/store";

export function HomeSection({
  onNavigate,
}: {
  onNavigate: (section: SectionKey) => void;
}) {
  const { state } = useDemoStore();
  const [renderedAt] = useState(() => Date.now());
  const nextShift = [...state.shifts]
    .filter((shift) => new Date(shift.endsAt).getTime() > renderedAt)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )[0];
  const todayShifts = state.shifts.filter((shift) =>
    isSameDay(new Date(shift.startsAt), new Date()),
  );
  const pendingRequests = state.requests.filter((request) =>
    ["submitted", "approved", "issued"].includes(request.status),
  );
  const openTickets = state.tickets.filter(
    (ticket) => ticket.status !== "closed",
  );
  const lowStock = state.inventory.filter(
    (item) => item.available / item.total <= 0.3,
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
              onClick={() => onNavigate("inventory")}
            >
              Request equipment
            </Button>
            <Button
              ghost
              icon={<CalendarOutlined />}
              onClick={() => onNavigate("roster")}
            >
              View roster
            </Button>
          </div>
        </div>
        {nextShift && (
          <div className="hero-shift">
            <span className="hero-shift-label">Your next shift</span>
            <h3>
              {nextShift.period} ·{" "}
              {format(new Date(nextShift.startsAt), "h:mm a")}
            </h3>
            <p>
              {format(new Date(nextShift.startsAt), "EEE, d MMM")} ·{" "}
              {nextShift.location}
            </p>
            <div className="avatar-stack">
              {nextShift.assignees.map((person) => (
                <Avatar
                  key={person.id}
                  size={28}
                  style={{ background: "#ff6257" }}
                >
                  {initials(person.name)}
                </Avatar>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="section-grid metrics">
        <MetricCard
          label="Today’s shifts"
          value={todayShifts.length}
          note={`${todayShifts.reduce((sum, shift) => sum + shift.assignees.length, 0)} volunteer assignments`}
          icon={<TeamOutlined />}
        />
        <MetricCard
          label="Active requests"
          value={pendingRequests.length}
          note={`${pendingRequests.filter((request) => request.status === "submitted").length} awaiting approval`}
          icon={<ClockCircleOutlined />}
        />
        <MetricCard
          label="Open tickets"
          value={openTickets.length}
          note={`${openTickets.filter((ticket) => ticket.priority === "high").length} high priority`}
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
              onClick={() => onNavigate("roster")}
            />
          </div>
          {state.shifts.slice(0, 4).map((shift) => (
            <div className="schedule-row" key={shift.id}>
              <div className="date-tile">
                <strong>{format(new Date(shift.startsAt), "dd")}</strong>
                <span>{format(new Date(shift.startsAt), "MMM")}</span>
              </div>
              <div>
                <p className="row-title">
                  {shift.period} · {format(new Date(shift.startsAt), "h:mm a")}
                </p>
                <p className="row-meta">
                  {shift.assignees.map((person) => person.name).join(" · ")}
                </p>
              </div>
              <Tag color={shift.period === "Morning" ? "gold" : "purple"}>
                {shift.location}
              </Tag>
            </div>
          ))}
        </Card>

        <Card className="surface-card">
          <div className="card-heading">
            <div>
              <h3>Inventory requests</h3>
              <p>Items that still need attention</p>
            </div>
            <Button
              type="text"
              icon={<ArrowRightOutlined />}
              onClick={() => onNavigate("inventory")}
            />
          </div>
          {pendingRequests.map((request) => (
            <div className="request-row" key={request.id}>
              <div>
                <span className="request-id">{request.id}</span>
                <h4>{request.title}</h4>
                <div className="request-items">
                  {request.items.map((item) => item.name).join(" · ")}
                </div>
              </div>
              <div className="request-actions">
                {request.isOverdue && (
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
                className="link-row"
              >
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
              margin: "0 0 20px",
              color: "#6f7279",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            {state.homeContent.guidelines}
          </p>
          <Space wrap>
            <Button
              icon={<WhatsAppOutlined />}
              href={state.homeContent.whatsappUrl}
              target="_blank"
            >
              Support chat
            </Button>
            <Button
              icon={<PlayCircleOutlined />}
              href={state.homeContent.tutorialUrl}
              target="_blank"
            >
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
        <CheckCircleOutlined style={{ marginRight: 5, color: "#58a384" }} />
        {note}
      </div>
    </Card>
  );
}
