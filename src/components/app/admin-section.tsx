"use client";

import {
  AppstoreOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  LinkOutlined,
  PlusOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import {
  App,
  Avatar,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  type TableProps,
} from "antd";
import { useState } from "react";
import type { Profile } from "@/domain/types";
import { useDemoStore } from "@/demo/store";
import { initials } from "./shared";

type Manager =
  | "department"
  | "location"
  | "equipmentType"
  | "inventory"
  | "link"
  | "home";

interface MasterOption {
  id: string;
  name: string;
}

export function AdminSection() {
  const { state, actions } = useDemoStore();
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();
  const [manager, setManager] = useState<Manager | null>(null);
  const [managerForm] = Form.useForm();
  const [equipmentTypes, setEquipmentTypes] = useState<MasterOption[]>([]);
  const [locations, setLocations] = useState<MasterOption[]>([]);
  const people = state.profiles.filter((profile) =>
    [profile.name, profile.email, profile.department]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const columns: TableProps<Profile>["columns"] = [
    {
      title: "Person",
      key: "person",
      render: (_, profile) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar style={{ background: "#ff6257" }}>
            {initials(profile.name)}
          </Avatar>
          <div>
            <strong style={{ display: "block", fontSize: 12 }}>
              {profile.name}
            </strong>
            <span style={{ color: "#85888f", fontSize: 10 }}>
              {profile.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "Department",
      dataIndex: "department",
      responsive: ["md"],
    },
    {
      title: "Role",
      dataIndex: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "volcano" : "default"}>{role}</Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "active" ? "success" : "warning"}>{status}</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, profile) => (
        <Space size={6}>
          <Button
            size="small"
            disabled={profile.id === state.currentUser.id}
            onClick={() =>
              void updateAccess(profile.id, {
                role: profile.role === "admin" ? "member" : "admin",
              })
            }
          >
            {profile.role === "admin" ? "Make member" : "Make admin"}
          </Button>
          <Button
            size="small"
            danger={profile.status === "active"}
            disabled={profile.id === state.currentUser.id}
            onClick={() =>
              void updateAccess(profile.id, {
                status:
                  profile.status === "active" ? "disabled" : "active",
              })
            }
          >
            {profile.status === "active" ? "Disable" : "Enable"}
          </Button>
        </Space>
      ),
    },
  ];

  const updateAccess = async (
    id: string,
    input: { role?: "admin" | "member"; status?: "active" | "disabled" },
  ) => {
    try {
      await actions.updateUserAccess(id, input);
      message.success("Access updated.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Update failed.");
    }
  };

  const openManager = async (nextManager: Manager) => {
    setManager(nextManager);
    if (nextManager === "home") {
      managerForm.setFieldsValue(state.homeContent);
    } else {
      managerForm.resetFields();
      managerForm.setFieldsValue({
        requestable: true,
        enabled: true,
        displayOrder: 0,
        totalQuantity: 1,
        availableQuantity: 1,
      });
    }
    if (nextManager === "inventory") {
      try {
        const [typeResponse, locationResponse] = await Promise.all([
          fetch("/api/v1/equipment-types"),
          fetch("/api/v1/locations"),
        ]);
        const [typeBody, locationBody] = (await Promise.all([
          typeResponse.json(),
          locationResponse.json(),
        ])) as [{ data: MasterOption[] }, { data: MasterOption[] }];
        setEquipmentTypes(typeBody.data);
        setLocations(locationBody.data);
      } catch {
        message.error("Master data could not be loaded.");
      }
    }
  };

  const saveManager = async (values: Record<string, unknown>) => {
    if (!manager) return;
    const config: Record<
      Manager,
      { path: string; method: "POST" | "PUT"; label: string }
    > = {
      department: {
        path: "/api/v1/departments",
        method: "POST",
        label: "Department",
      },
      location: {
        path: "/api/v1/locations",
        method: "POST",
        label: "Location",
      },
      equipmentType: {
        path: "/api/v1/equipment-types",
        method: "POST",
        label: "Equipment type",
      },
      inventory: {
        path: "/api/v1/inventory/items",
        method: "POST",
        label: "Inventory item",
      },
      link: {
        path: "/api/v1/admin/links",
        method: "POST",
        label: "Quick link",
      },
      home: {
        path: "/api/v1/admin/home-content",
        method: "PUT",
        label: "Home content",
      },
    };
    try {
      const selected = config[manager];
      const payload =
        manager === "home"
          ? {
              ...values,
              whatsappUrl: values.whatsappUrl || null,
              tutorialUrl: values.tutorialUrl || null,
            }
          : values;
      const response = await fetch(selected.path, {
        method: selected.method,
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Save failed.");
      }
      setManager(null);
      message.success(`${selected.label} saved.`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Save failed.");
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Keep the workspace clean and current.</h2>
          <p>
            Manage access, master data and the content shown to the operations
            team.
          </p>
        </div>
        <div className="page-actions">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setInviteOpen(true)}
          >
            Invite person
          </Button>
        </div>
      </div>

      <div className="admin-grid">
        <AdminTile
          icon={<UserSwitchOutlined />}
          title="People & access"
          description={`${state.profiles.filter((profile) => profile.status === "active").length} active people, roles and Google account access.`}
        />
        <AdminTile
          icon={<TeamOutlined />}
          title="Departments"
          description="Team ownership, contact points and roster grouping."
          onClick={() => void openManager("department")}
        />
        <AdminTile
          icon={<EnvironmentOutlined />}
          title="Locations"
          description="Studios, storage bays and operational work areas."
          onClick={() => void openManager("location")}
        />
        <AdminTile
          icon={<AppstoreOutlined />}
          title="Equipment types"
          description={`${state.inventory.length} tracked inventory items and availability.`}
          onClick={() => void openManager("inventory")}
        />
        <AdminTile
          icon={<LinkOutlined />}
          title="Quick links"
          description={`${state.links.length} operational resources displayed on Home.`}
          onClick={() => void openManager("link")}
        />
        <AdminTile
          icon={<HomeOutlined />}
          title="Home content"
          description="Guidelines, support chat and booking tutorial links."
          onClick={() => void openManager("home")}
        />
      </div>

      <Card className="surface-card" style={{ marginTop: 20 }}>
        <div className="card-heading">
          <div>
            <h3>People & access</h3>
            <p>Only active, approved Google accounts can enter</p>
          </div>
          <Input.Search
            allowClear
            placeholder="Search people"
            style={{ width: 240 }}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={people}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          scroll={{ x: 620 }}
        />
      </Card>

      <Modal
        title="Invite a team member"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => inviteForm.submit()}
        okText="Add to allowlist"
        destroyOnHidden
      >
        <Form
          form={inviteForm}
          layout="vertical"
          initialValues={{ role: "member", timezone: "Asia/Kolkata" }}
          onFinish={async (values) => {
            try {
              await actions.inviteProfile(values);
              inviteForm.resetFields();
              setInviteOpen(false);
              message.success("Person added. They can now sign in with Google.");
            } catch (error) {
              message.error(
                error instanceof Error ? error.message : "Invite failed.",
              );
            }
          }}
        >
          <Form.Item
            name="email"
            label="Google account email"
            rules={[{ required: true, type: "email" }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="name" label="Display name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "member", label: "Member" },
                { value: "admin", label: "Administrator" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="timezone"
            label="Time zone"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={managerTitle(manager)}
        open={Boolean(manager)}
        onCancel={() => setManager(null)}
        onOk={() => managerForm.submit()}
        okText="Save"
        destroyOnHidden
      >
        <Form
          form={managerForm}
          layout="vertical"
          onFinish={(values) => void saveManager(values)}
        >
          {manager === "department" && (
            <>
              <Form.Item name="name" label="Department name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="shortName" label="Short name">
                <Input />
              </Form.Item>
            </>
          )}
          {manager === "location" && (
            <Form.Item name="name" label="Location name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          {manager === "equipmentType" && (
            <>
              <Form.Item name="name" label="Type name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item name="requestable" label="Members can request" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
          {manager === "inventory" && (
            <>
              <Form.Item name="name" label="Item name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="equipmentTypeId"
                label="Equipment type"
                rules={[{ required: true }]}
              >
                <Select
                  options={equipmentTypes.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Button
                        type="link"
                        onClick={() => void openManager("equipmentType")}
                      >
                        Add equipment type
                      </Button>
                    </>
                  )}
                />
              </Form.Item>
              <Form.Item name="locationId" label="Location">
                <Select
                  allowClear
                  options={locations.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="serialNumber" label="Serial / asset number">
                <Input />
              </Form.Item>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Form.Item name="totalQuantity" label="Total" rules={[{ required: true }]}>
                  <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item
                  name="availableQuantity"
                  label="Available"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                </Form.Item>
              </div>
              <Form.Item name="adminNotes" label="Admin notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          )}
          {manager === "link" && (
            <>
              <Form.Item name="name" label="Link name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="url" label="URL" rules={[{ required: true, type: "url" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="displayOrder" label="Display order">
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="enabled" label="Visible" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
          {manager === "home" && (
            <>
              <Form.Item name="supportMessage" label="Support message" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="guidelines" label="Guidelines" rules={[{ required: true }]}>
                <Input.TextArea rows={7} />
              </Form.Item>
              <Form.Item name="whatsappUrl" label="WhatsApp URL" rules={[{ type: "url" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="tutorialUrl" label="Tutorial URL" rules={[{ type: "url" }]}>
                <Input />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

function AdminTile({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className="surface-card admin-tile"
      hoverable={Boolean(onClick)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="admin-tile-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </Card>
  );
}

function managerTitle(manager: Manager | null) {
  const titles: Record<Manager, string> = {
    department: "Add department",
    location: "Add location",
    equipmentType: "Add equipment type",
    inventory: "Add inventory item",
    link: "Add quick link",
    home: "Edit Home content",
  };
  return manager ? titles[manager] : "";
}
