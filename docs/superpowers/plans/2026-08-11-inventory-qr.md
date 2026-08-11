# Inventory QR Scan and Type QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR scanning to editable inventory requests and downloadable UUID QR codes to the inventory-types settings table.

**Architecture:** Keep QR payload matching and item incrementing in pure frontend helpers, add a small reusable camera scanner component using `html5-qrcode`, and wire it into `InventoryDetail`. Add the QR download action to the existing settings resource table using `qrcode` and a browser download link. Reuse existing API update/CRUD calls; no backend changes are needed.

**Tech Stack:** React 19, TypeScript, Ant Design, `html5-qrcode` 2.3.x, `qrcode` 1.5.x, existing Apps Script API/mock transport.

## Global Constraints

- Encode only the inventory type UUID/`Id` as the QR payload.
- Scan matching is exact after trimming decoded text.
- A matching scan adds quantity one or increments the existing item quantity, preserving other items and conditions.
- Unknown QR values show an error and keep the scanner modal available.
- Scan is available only while the request is editable.
- Inventory-type QR generation is client-side and must not add a backend endpoint.
- Existing edit/delete/request update permissions remain authoritative.

---

### Task 1: Add QR dependencies and pure inventory scan helpers

**Files:**
- Modify: `package.json` to add `html5-qrcode: ^2.3.8` and `qrcode: ^1.5.4`.
- Modify: `package-lock.json` through the package manager.
- Create: `frontend/src/ui/inventory-qr.ts`.
- Create: `frontend/src/ui/inventory-qr.test.ts`.

**Interfaces:**
- Produces `findInventoryTypeByQrValue(types: InventoryTypeDTO[], decodedValue: string): InventoryTypeDTO | null`.
- Produces `addScannedInventoryItem(items: InventoryItemDTO[], inventoryTypeId: string): InventoryItemDTO[]`.
- Produces `inventoryTypeQrFilename(type: InventoryTypeDTO): string`.

- [ ] **Step 1: Write failing helper assertions.**

  Cover exact trimmed UUID matching, rejection of an unknown/case-changed value, adding a new item with quantity one and empty condition, incrementing only the matched item, preserving other item quantities/conditions, and a sanitized readable filename.

- [ ] **Step 2: Run the focused typecheck and verify failure.**

  Run: `npm run typecheck`

  Expected: FAIL because `frontend/src/ui/inventory-qr.ts` does not exist.

- [ ] **Step 3: Add dependencies and install the lockfile.**

  Run: `npm install html5-qrcode@^2.3.8 qrcode@^1.5.4`

  Expected: `package.json` and `package-lock.json` contain the requested dependencies.

- [ ] **Step 4: Implement the minimal pure helpers.**

  Return new item arrays without mutating the current request. Match `decodedValue.trim()` exactly to `type.Id`. For a new item use `{ InventoryTypeId: id, Quantity: 1, Condition: '' }`; for an existing item increment `Quantity` and preserve its `Condition`.

- [ ] **Step 5: Run helper assertions and typecheck.**

  Run: `npm run typecheck` and compile/run the assertion module with esbuild and Node, as done for `program-actions.test.ts`.

  Expected: PASS.

---

### Task 2: Add reusable camera scanner modal content

**Files:**
- Create: `frontend/src/ui/qr-scanner.tsx`.
- Modify: `frontend/src/sections/refine-app.tsx` to render the scanner modal and handle scan results.

**Interfaces:**
- Produces `QrScanner({ onScan, onError }: { onScan: (value: string) => void; onError?: (message: string) => void })`.
- Uses a stable DOM element id, dynamic `import('html5-qrcode')`, rear-camera constraints, and cleanup on unmount/close.
- Consumes `findInventoryTypeByQrValue`, `addScannedInventoryItem`, existing `persistItems`, and existing error feedback.

- [ ] **Step 1: Add a focused component contract test or compile checkpoint.**

  Verify the component exports the named scanner and accepts decoded-value/error callbacks. If the existing test harness cannot mount browser camera components, use TypeScript plus the pure helper tests as the deterministic gate.

- [ ] **Step 2: Implement scanner startup and cleanup.**

  Dynamically import `html5-qrcode` only after the modal renders. Start the environment-facing camera, render a scanner viewport, ignore frame decode failures, stop/clear the scanner on successful non-continuous scan and on unmount, and surface camera startup errors through `onError`.

- [ ] **Step 3: Wire Scan into `InventoryDetail`.**

  Add `Scan` beside `Add` when `editable`. On decoded text, find the type; if absent set the existing item error to `Inventory type not found for this QR code` without closing the modal. If present, call `persistItems(addScannedInventoryItem(items, type.Id))`, close the modal after the update succeeds, and leave the existing Add/Edit item flow unchanged.

- [ ] **Step 4: Run formatting and typecheck.**

  Run: `npx prettier --write frontend/src/ui/qr-scanner.tsx frontend/src/ui/inventory-qr.ts frontend/src/ui/inventory-qr.test.ts frontend/src/sections/refine-app.tsx && npm run format:check && npm run typecheck`

  Expected: PASS.

---

### Task 3: Add inventory-type QR download action

**Files:**
- Modify: `frontend/src/sections/refine-settings.tsx`.

**Interfaces:**
- Uses `DownloadOutlined` and `qrcode.toDataURL(String(row.Id))`.
- Adds an action before the existing Edit action for inventory-type rows only.

- [ ] **Step 1: Implement client-side QR generation.**

  On click, dynamically import `qrcode`, generate a data URL from `String(row.Id)`, create a temporary anchor with `download={inventoryTypeQrFilename(row)}`, click it, and remove it. Surface generation failures through the existing `showErrorAlert` path.

- [ ] **Step 2: Render the accessible action.**

  Add a download-icon button before Edit with `aria-label="Download QR code"` and a tooltip/title. Do not change edit/delete controls or other resource rows.

- [ ] **Step 3: Run formatting and typecheck.**

  Run: `npm run format:check && npm run typecheck`

  Expected: PASS.

---

### Task 4: Final verification

**Files:**
- Modify: none unless verification finds an issue.

- [ ] **Step 1: Run helper assertions and existing tests.**

  Run the inventory QR helper assertions, program-action assertions, and `node build-tools/notifications.test.mjs`.

  Expected: PASS.

- [ ] **Step 2: Build production assets.**

  Run: `npm run build`

  Expected: PASS with the scanner dependency bundled by the frontend build.

- [ ] **Step 3: Review the final diff.**

  Run: `git diff --check && git status --short`.

  Confirm no backend or shared API files changed, scan remains gated by request editability, and QR payload is exactly the inventory type UUID.

