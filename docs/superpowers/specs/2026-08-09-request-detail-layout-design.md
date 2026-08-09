# Request Detail Layout Design

## Goal

Rearrange Programs, Inventory, and Ticket Details so desktop pages use a left content column and a full-height Activity column on the right. Activity scrolls internally when needed.

## Design

- `DetailLayout` owns a two-column desktop grid.
- The left column contains the Details card and, where applicable, the related resource card:
    - Programs: Sessions below Details.
    - Inventory: Requested items below Details.
    - Tickets: Details only.
- Activity occupies the right column and stretches to the available page height below the page heading.
- Activity's content scrolls vertically inside its column when it exceeds the available height.
- At mobile/tablet widths, the layout becomes normal document flow: left content first, Activity below it, with no viewport-height constraint on Activity.
- Existing data loading, editing, actions, and cards remain unchanged.

## Verification

- Run the project's typecheck/build commands.
- Confirm the shared layout is used by all three detail views.
- Confirm the responsive breakpoint removes the desktop internal-scroll behavior.
