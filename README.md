# jiracule

A lightweight Jira Cloud board frontend — view boards, filter by assignee,
create / move / search / delete issues, switch boards — without the RAM cost of
the official Jira web app.

Single full-stack [TanStack Start](https://tanstack.com/start) app: React +
TanStack Router + TanStack Query on the client. **Server functions** proxy Jira
Cloud; each user signs in with **Atlassian OAuth 2.0 (3LO)** and their tokens live
in an encrypted session cookie — no shared API token, nothing sensitive reaches
the browser.

## Setup

1. Register an **OAuth 2.0 (3LO)** app at
   [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/):
   - Add the **Jira** permission with scopes
     `read:jira-work write:jira-work read:jira-user offline_access`.
   - Set the callback URL to `http://localhost:3000/auth/callback`.
2. Configure and run:
   ```bash
   cp .env.example .env   # fill in the values below
   npm install
   npm run dev            # http://localhost:3000
   ```

`.env` (auto-loaded in dev and by the built server):

| var                       | value                                                    |
| ------------------------- | -------------------------------------------------------- |
| `ATLASSIAN_CLIENT_ID`     | from your OAuth app                                      |
| `ATLASSIAN_CLIENT_SECRET` | from your OAuth app                                      |
| `OAUTH_REDIRECT_URI`      | `http://localhost:3000/auth/callback`                    |
| `SESSION_SECRET`          | random ≥32-char string (`openssl rand -base64 48`)       |

Then open the app and click **Connect Jira** to authorize.

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
- `src/queries.ts` — TanStack Query hooks wrapping the server functions.
- `src/routes/` — file-based routes: `/` (board list), `/board/$boardId`.
- `src/components/` — Board / Column / Card (drag-and-drop via `@dnd-kit`),
  toolbar (assignee filter + search), create + detail dialogs.

**Boards → columns → statuses:** a board's columns come from its Agile
*configuration*; each column maps to issue statuses. Moving a card is a workflow
*transition* into a status belonging to the target column (resolved server-side).
Illegal moves surface an error and the optimistic move rolls back.

## Build / deploy

```bash
npm run build      # emits dist/client + dist/server (a fetch-handler module)
```

`npm run dev` is the supported local run today and works fully (server functions
included). The app is deployment-*ready* — secrets come from env, and the server
functions are the only server surface — but hosting needs a deployment adapter
added (Node/Nitro/Cloudflare), e.g. `npx @tanstack/cli add` a target, set the same
env vars in the host, and add the host's callback URL to the OAuth app. That's
intentionally left for "deploy later".

## Not in v1

Sprints/backlog, attachments/subtasks, arbitrary field editing, multi-site
picker (uses the first accessible Jira site), real-time updates, JQL box (search
uses JQL under the hood).
