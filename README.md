# jiracule

A lightweight Jira Cloud board frontend — view boards, filter by assignee,
create / move / search / delete issues, switch boards — without the RAM cost of
the official Jira web app.

Single full-stack [TanStack Start](https://tanstack.com/start) app: React +
TanStack Router + TanStack Query on the client, **server functions** hold the
Jira API token and proxy to Jira Cloud (the token never reaches the browser).

## Setup

```bash
cp .env.example .env   # then fill in your Jira Cloud creds
npm install
npm run dev            # http://localhost:3000
```

`.env` (auto-loaded in dev and by the built server):

| var              | value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `JIRA_BASE_URL`  | `https://your-org.atlassian.net`                                         |
| `JIRA_EMAIL`     | your Atlassian account email                                             |
| `JIRA_API_TOKEN` | [create one here](https://id.atlassian.com/manage-profile/security/api-tokens) |

## How it works

- `src/server/jira.server.ts` — server-only Jira Cloud client (Basic auth = base64
  `email:token`). Never imported into client code.
- `src/server/jira.functions.ts` — `createServerFn` RPC endpoints the client calls.
- `src/queries.ts` — TanStack Query hooks wrapping the server functions.
- `src/routes/` — file-based routes: `/` (board list), `/board/$boardId`.
- `src/components/` — Board / Column / Card (drag-and-drop via `@dnd-kit`),
  toolbar (assignee filter + search), create dialog.

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
added (Node/Nitro/Cloudflare), e.g. `npx @tanstack/cli add` a target and set the
same `JIRA_*` env vars in the host. That's intentionally left for "deploy later".

## Not in v1

Sprints/backlog, comments/attachments/subtasks, arbitrary field editing,
multi-user OAuth, real-time updates, JQL box (search uses JQL under the hood).
