# Own UI kit on Tailwind instead of Ant Design and Refine

Status: accepted

## Context

The app used Ant Design for components and Refine (headless) for data hooks.
Both were heavy for a small internal app: the production bundle was about
2.2 MB, antd's styling needed many `.ant-*` overrides for the mobile layout,
and the React 19 patch package was a standing workaround.

## Decision

- Components come from a small in-repo kit (`frontend/src/ui/kit.tsx`,
  `form-kit.tsx`, `overlay-kit.tsx`, `icons.tsx`) styled with Tailwind utilities
  against the Notion-inspired tokens in `frontend/input.css`.
- Native elements are preferred: `<select>`, `<dialog>`, `<table>`, checkboxes.
  Only the searchable select (combobox), multi-select, popover, menu and toasts
  are hand-built.
- Data hooks are `useList`/`useOne`/`useCreate`/`useUpdate`/`useDelete`/
  `useInvalidate`/`useApiQuery` in `frontend/src/ui/resources.ts`, a thin layer
  over `@tanstack/react-query` and the existing `api.ts` operations.

## Consequences

- Three dependencies fewer for the UI (`antd`, `@ant-design/icons`, the React 19
  patch) plus two Refine packages; the bundle is roughly halved.
- The team owns the kit's accessibility and edge cases, so new controls should
  be added to the kit rather than styled ad hoc on a screen.
- Forms use a vertical label-above-control layout everywhere.
- Light and dark themes are two blocks of the same tokens in `frontend/input.css`
  (`:root` and `:root[data-theme='dark']`). Screens use the token-backed Tailwind
  colours (`bg-surface`, `text-ink`, `bg-tag-green`...) and never a literal colour,
  so both themes stay correct. Dark is the default; the choice is saved in
  `localStorage` (`setu-theme`) by `frontend/src/ui/theme.ts`, and an inline script
  in `frontend/shell.html` applies it before first paint.
