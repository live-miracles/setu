"use client";

import {
  CheckOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import {
  App,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Tag,
} from "antd";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import type { Ticket, TicketStatus } from "@/domain/types";
import { useDemoStore } from "@/demo/store";
import { initials } from "./shared";
import { AttachmentUploader } from "./attachment-uploader";

interface TicketForm {
  title: string;
  description: string;
  location: string;
  priority: "low" | "medium" | "high";
}

const columns: { status: TicketStatus; title: string }[] = [
  { status: "unassigned", title: "Not assigned" },
  { status: "pending", title: "Pending" },
  { status: "closed", title: "Closed" },
];

export function TicketsSection() {
  const { state, actions } = useDemoStore();
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>();
  const [comment, setComment] = useState("");
  const [form] = Form.useForm<TicketForm>();
  const detailTicket =
    state.tickets.find((ticket) => ticket.id === detailTicketId) ?? null;

  const filtered = useMemo(
    () =>
      state.tickets.filter((ticket) =>
        [ticket.id, ticket.title, ticket.location, ticket.reporter.name]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, state.tickets],
  );

  const createTicket = async (values: TicketForm) => {
    try {
      await actions.addTicket({
        ...values,
        status: "unassigned",
        reporter: {
          id: state.currentUser.id,
          name: state.currentUser.name,
        },
      });
      form.resetFields();
      setCreateOpen(false);
      message.success("Ticket created. The operations team has been notified.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Create failed.");
    }
  };

  const assign = async () => {
    if (!selected || !assigneeId) {
      message.error("Select a team member.");
      return;
    }
    try {
      await actions.transitionTicket(selected.id, "pending", assigneeId);
      setSelected(null);
      setAssigneeId(undefined);
      message.success("Ticket assigned and notification queued.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Assign failed.");
    }
  };

  const transition = async (ticket: Ticket, status: TicketStatus) => {
    try {
      await actions.transitionTicket(ticket.id, status);
      message.success(`${ticket.id} moved to ${status}.`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Action failed.");
    }
  };

  const addComment = async () => {
    if (!detailTicket || !comment.trim()) return;
    try {
      await actions.addTicketComment(detailTicket.id, comment.trim());
      setComment("");
      message.success("Comment added.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Comment failed.");
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operational support</p>
          <h2>Resolve issues without losing context.</h2>
          <p>
            Capture the location, owner and full history of every studio issue.
          </p>
        </div>
        <div className="page-actions">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search tickets"
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 220 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New ticket
          </Button>
        </div>
      </div>

      <div className="tickets-board">
        {columns.map((column) => {
          const tickets = filtered.filter(
            (ticket) => ticket.status === column.status,
          );
          return (
            <section className="ticket-column" key={column.status}>
              <div className="ticket-column-title">
                <h3>{column.title}</h3>
                <Tag variant="filled">{tickets.length}</Tag>
              </div>
              {tickets.map((ticket) => (
                <article className="ticket-card" key={ticket.id}>
                  <span className="request-id">{ticket.id}</span>
                  <h4>{ticket.title}</h4>
                  <p>{ticket.description}</p>
                  <div className="row-meta">
                    <EnvironmentOutlined style={{ marginRight: 5 }} />
                    {ticket.location} ·{" "}
                    {formatDistanceToNow(new Date(ticket.updatedAt), {
                      addSuffix: true,
                    })}
                  </div>
                  <div className="ticket-card-footer">
                    <span>
                      {ticket.assignee ? (
                        <Avatar
                          size={26}
                          style={{ background: "#58c9bd" }}
                        >
                          {initials(ticket.assignee.name)}
                        </Avatar>
                      ) : (
                        <Tag
                          color={
                            ticket.priority === "high" ? "error" : "warning"
                          }
                          variant="filled"
                        >
                          {ticket.priority}
                        </Tag>
                      )}
                    </span>
                    <span>
                      <Button
                        size="small"
                        icon={<MessageOutlined />}
                        onClick={() => setDetailTicketId(ticket.id)}
                        style={{ marginRight: 6 }}
                      >
                        {ticket.comments.length || "Details"}
                      </Button>
                      {ticket.status === "unassigned" &&
                        state.currentUser.role === "admin" && (
                        <Button
                          size="small"
                          type="primary"
                          icon={<UserAddOutlined />}
                          onClick={() => setSelected(ticket)}
                        >
                          Assign
                        </Button>
                      )}
                      {ticket.status === "pending" &&
                        (state.currentUser.role === "admin" ||
                          ticket.assignee?.id === state.currentUser.id) && (
                        <Button
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => transition(ticket, "closed")}
                        >
                          Close
                        </Button>
                      )}
                      {ticket.status === "closed" &&
                        state.currentUser.role === "admin" && (
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => transition(ticket, "pending")}
                        >
                          Reopen
                        </Button>
                      )}
                    </span>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <Modal
        title="Create support ticket"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="Create ticket"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={createTicket}
          initialValues={{ priority: "medium" }}
        >
          <Form.Item
            name="title"
            label="Issue"
            rules={[{ required: true, min: 3 }]}
          >
            <Input placeholder="Short, searchable title" />
          </Form.Item>
          <Form.Item
            name="location"
            label="Location"
            rules={[{ required: true }]}
          >
            <Input placeholder="Studio or equipment location" />
          </Form.Item>
          <Form.Item
            name="priority"
            label="Priority"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, min: 8 }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="What happened, when, and what have you already tried?"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detailTicket ? `${detailTicket.id} · ${detailTicket.title}` : "Ticket"}
        open={Boolean(detailTicket)}
        onCancel={() => setDetailTicketId(null)}
        footer={null}
      >
        {detailTicket && (
          <div className="list-stack">
            <p style={{ color: "#686c74", marginTop: 0 }}>
              {detailTicket.description}
            </p>
            <AttachmentUploader
              ownerType="ticket"
              ownerId={detailTicket.recordId}
            />
            <div className="list-stack">
              {detailTicket.comments.length === 0 ? (
                <p className="row-meta">No comments yet.</p>
              ) : (
                detailTicket.comments.map((item) => (
                  <div className="request-row" key={item.id}>
                    <div>
                      <strong>{item.author.name}</strong>
                      <div className="request-items">{item.message}</div>
                    </div>
                    <span className="request-id">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Input.TextArea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add context, troubleshooting notes or a handover"
            />
            <Button
              type="primary"
              disabled={!comment.trim()}
              onClick={() => void addComment()}
            >
              Add comment
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        title={selected ? `Assign ${selected.id}` : "Assign ticket"}
        open={Boolean(selected)}
        onCancel={() => setSelected(null)}
        onOk={assign}
        okText="Assign & notify"
      >
        <p style={{ color: "#74777f" }}>
          The selected volunteer will receive an in-app notification, email and
          Web Push if enabled.
        </p>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Select a volunteer"
          style={{ width: "100%" }}
          options={state.profiles
            .filter((profile) => profile.status === "active")
            .map((profile) => ({
              value: profile.id,
              label: `${profile.name} · ${profile.department}`,
            }))}
        />
      </Modal>
    </>
  );
}
