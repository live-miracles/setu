# Inventory QR Scan and Type QR Design

## Goal

Allow inventory request users to scan an inventory-type QR code to add one requested item, and allow inventory-type managers to download a QR code for each inventory type.

## Scope and constraints

- Frontend workflow with the existing inventory request update and inventory-type CRUD APIs.
- Add `html5-qrcode` for camera scanning and `qrcode` for QR image generation, matching the proven sibling `../vp-app` implementation.
- Encode only the inventory type's existing `Id`/UUID in generated QR codes.
- Do not add backend endpoints or change the shared data contract.
- Preserve existing request permissions: the Scan action is shown only when the request is editable, and the existing update endpoint remains authoritative.
- Preserve existing inventory-type edit/delete behavior.

## User experience

The inventory request detail's “Requested items” card will have a `Scan` button beside `Add`. It opens a scanner modal using the device camera. On a decoded value, the frontend trims the value and matches it exactly against `dashboard.inventoryTypes[].Id`.

- If a type matches, add one item or increment the existing quantity for that type, persist through `updateInventoryRequest`, close the scanner, and refresh the request.
- If no type matches, show an error such as “Inventory type not found for this QR code” and keep the scanner available.
- Scanner startup/camera permission failures use the existing error feedback path and allow the modal to be closed.
- The control is hidden when the request is not editable, matching the existing Add/Edit item permissions.

The inventory-types settings table will add a download-icon button immediately before Edit. Clicking it generates a QR image whose payload is the inventory type UUID and downloads it with a readable filename derived from the type name and ID. The button has an accessible label and tooltip.

## Data flow

Scanning reuses the same update payload as `persistItems` in `InventoryDetail`: copy current request fields and map the updated item list to `{ inventoryTypeId, quantity, condition }`. Existing item conditions remain unchanged; a newly scanned item starts with an empty condition.

QR generation is client-side. It does not persist an image or call the backend. The QR payload is `String(row.Id)` and is generated only after a user clicks the inventory-type row action.

## Testing

Add focused frontend helper tests for:

- exact UUID matching and unknown-code errors;
- adding a new inventory type with quantity one;
- incrementing an existing inventory type without changing other items or conditions;
- preserving the request update payload shape;
- QR download filename/payload normalization where the generator wrapper can be tested without a browser camera.

Run formatting, typecheck, helper assertions, and production build verification.

