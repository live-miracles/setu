import { describe, expect, it } from "vitest";
import {
  createInventoryItemSchema,
  createInventoryRequestSchema,
  createShiftSchema,
  uploadUrlSchema,
} from "./schemas";

describe("command validation", () => {
  it("rejects a roster shift whose end is before its start", () => {
    const result = createShiftSchema.safeParse({
      startsAt: "2026-07-28T12:00:00.000Z",
      endsAt: "2026-07-28T11:00:00.000Z",
      period: "Morning",
      locationName: "Drishti Studio",
      assigneeIds: ["18f9ab6d-b735-4fcb-b200-7996b178aa90"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects inventory availability above total stock", () => {
    const result = createInventoryItemSchema.safeParse({
      name: "Test camera",
      equipmentTypeId: "18f9ab6d-b735-4fcb-b200-7996b178aa90",
      totalQuantity: 2,
      availableQuantity: 3,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid multi-item inventory request", () => {
    const result = createInventoryRequestSchema.safeParse({
      title: "Studio setup",
      fromDate: "2026-07-29",
      toDate: "2026-07-31",
      purpose: "Prepare the studio for a scheduled livestream.",
      items: [
        {
          inventoryItemId: "18f9ab6d-b735-4fcb-b200-7996b178aa90",
          quantity: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("blocks unsupported or oversized attachments", () => {
    expect(
      uploadUrlSchema.safeParse({
        ownerType: "ticket",
        ownerId: "18f9ab6d-b735-4fcb-b200-7996b178aa90",
        fileName: "payload.exe",
        contentType: "application/octet-stream",
        sizeBytes: 100,
      }).success,
    ).toBe(false);
    expect(
      uploadUrlSchema.safeParse({
        ownerType: "ticket",
        ownerId: "18f9ab6d-b735-4fcb-b200-7996b178aa90",
        fileName: "large.pdf",
        contentType: "application/pdf",
        sizeBytes: 16 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });
});
