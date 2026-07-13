# jiracule — architecture & conventions

A single full-stack [TanStack Start](https://tanstack.com/start) app (React +
TanStack Router + TanStack Query). **Server functions** proxy Jira Cloud; each
user signs in with **Atlassian OAuth 2.0 (3LO)** and their tokens live in an
encrypted session cookie — no shared API token, nothing sensitive reaches the
browser. See `README.md` for setup and running.

## How it works

- `src/server/session.server.ts` — OAuth flow helpers + encrypted-cookie session
  (token exchange, refresh, cloudId resolution). Server-only.
- `src/routes/auth.login.ts` / `auth.callback.ts` / `auth.logout.ts` — the OAuth
  redirect flow (server routes) with PKCE + state.
- `src/server/auth.middleware.ts` — resolves the session into `context.jira`;
  rejects unauthenticated calls, which the UI turns into the connect screen.
- `src/server/jira.server.ts` — server-only Jira client; per-request Bearer auth
  against `api.atlassian.com/ex/jira/{cloudId}`.
- `src/server/jira.functions.ts` — `createServerFn` RPC endpoints (auth-gated).
- `src/queries.ts` — TanStack Query hooks wrapping the server functions, plus the
  `keys` cache-key registry and the shared invalidation helpers.
- `src/routes/` — file-based routes: `/` (board list), `/board/$boardId`.
- `src/components/` — Board / Column / Card (drag-and-drop via `@dnd-kit`),
  toolbar (assignee filter + search), create + detail dialogs.

**Boards → columns → statuses:** a board's columns come from its Agile
*configuration*; each column maps to one or more issue statuses. Agile columns
pool their statuses into a single lane (marked `pooled`, statuses shown as header
chips); Work Management columns stack one labeled lane per status. Moving a card
is a workflow *transition* into a status belonging to the target column (resolved
server-side). Illegal moves surface an error and the optimistic move rolls back.

**Cache invalidation:** lane (column) queries live under the `['board', boardId,
'lane', …]` key prefix (`keys.lanes`); board *metadata* lives under `['boards']`.
Anything that changes an issue's status/fields must invalidate `['board']` too,
or the card won't move columns. Jira's search index is eventually consistent, so
lane refetches are also re-run after `RECONCILE_DELAY_MS`.

## Conventions

- **Package manager: pnpm** (declared in `package.json` `packageManager`). Use
  `pnpm`, never `npm`/`yarn`.
- **Styling: migrating to Tailwind v4 (hybrid, in progress).** `src/styles.css`
  (imported via `?url` in `src/routes/__root.tsx`) imports Tailwind's theme +
  utilities layers but **omits Preflight**, so the remaining hand-written rules
  render unchanged while utilities are adopted component by component. Design
  tokens are CSS custom properties on `:root` (swapped under
  `prefers-color-scheme: dark`) mapped into Tailwind via `@theme` — so utilities
  like `bg-surface`, `text-muted`, `border-line`, `rounded-card` resolve through
  the same variables and **dark mode is automatic (no `dark:` variants)**. When
  migrating a component, use utilities and delete its old `/* --- section --- */`
  from `styles.css`. Keep `@theme`, `@keyframes`, and base-layer rules in CSS.
- **Adding a dependency changes `pnpm-lock.yaml`, so `nix/package.nix`'s
  `pnpmDeps` hash must be updated** or `make deploy` fails. The deploy build
  prints the correct hash on mismatch (local `nix build` may OOM fetching all
  platform binaries; the hash is platform-independent, so naboo's value is
  canonical) — paste it into `nix/package.nix` and redeploy.
- **Text-field save shortcuts:** single-line fields save on Enter; multi-line
  fields save on Cmd/Ctrl+Enter (see `InlineEditor`'s `singleLine` prop).
- **Deploy:** `make deploy` — pushes the current branch and rebuilds the
  `jiracule` NixOS service on the `naboo` host.
- Before committing, run `npx tsc --noEmit` and `pnpm build`.
