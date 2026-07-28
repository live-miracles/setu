"use client";

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { Tag } from "antd";
import type {
  InventoryRequestStatus,
  TicketStatus,
} from "@/domain/types";

const colors: Record<string, { color: string; background: string }> = {
  draft: { color: "#656870", background: "#f1f1ed" },
  submitted: { color: "#98651e", background: "#fff3dd" },
  approved: { color: "#1f7c62", background: "#e6f7f0" },
  issued: { color: "#225a91", background: "#eaf3ff" },
  returned: { color: "#1f7c62", background: "#e6f7f0" },
  rejected: { color: "#a73e4c", background: "#ffebee" },
  cancelled: { color: "#656870", background: "#f1f1ed" },
  closed: { color: "#656870", background: "#f1f1ed" },
  unassigned: { color: "#98651e", background: "#fff3dd" },
  pending: { color: "#225a91", background: "#eaf3ff" },
};

export function StatusTag({
  status,
}: {
  status: InventoryRequestStatus | TicketStatus;
}) {
  const palette = colors[status] ?? colors.draft;
  const icon =
    status === "closed" || status === "returned" || status === "approved" ? (
      <CheckCircleOutlined />
    ) : status === "rejected" || status === "cancelled" ? (
      <CloseCircleOutlined />
    ) : status === "submitted" || status === "unassigned" ? (
      <ExclamationCircleOutlined />
    ) : (
      <ClockCircleOutlined />
    );

  return (
    <Tag
      className="status-tag"
      icon={icon}
      style={{ color: palette.color, background: palette.background }}
    >
      {status}
    </Tag>
  );
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
