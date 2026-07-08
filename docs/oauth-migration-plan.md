# Plan: OAuth 2.0 (3LO) instead of `.env` API token

## Context / goal

Replace the single-user static Basic-auth (`JIRA_EMAIL` + `JIRA_API_TOKEN` from env)
with per-user Atlassian OAuth. Each visitor authenticates as themselves, the app holds
only *app* credentials, and tokens live in server-side sessions — the "multi-user /
deployable" milestone. The `config()`/`jiraFetch` seam already isolates auth, so the
blast radius is contained.

## Key decisions (defaults; revisit if needed)

- **Session store:** in-memory `Map` for v1 (single instance). Behind an interface so
  Redis/DB is a later drop-in.
- **Site selection:** auto-pick the **first** accessible cloudId in v1; multi-site picker
  deferred.
- **PKCE + `state`:** yes (S256); signed httpOnly cookie for `state`/verifier.
- **Token lifetime:** refresh access tokens on demand via `offline_access` refresh tokens
  (rotating).

---

## Phase 0 — Atlassian app registration (manual, one-time)

In developer.atlassian.com → **OAuth 2.0 (3LO)** app:

- Callback URL: `http://localhost:3000/auth/callback` (+ prod URL later).
- Scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`.
- New env vars (app creds, not user creds):
  ```
  ATLASSIAN_CLIENT_ID=…
  ATLASSIAN_CLIENT_SECRET=…
  OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
  SESSION_SECRET=<random 32+ bytes>   # signs cookies
  ```
  Drop `JIRA_EMAIL` / `JIRA_API_TOKEN`.

## Phase 1 — Session layer (`src/server/session.server.ts`, new)

- Cookie `jiracule_sid`: httpOnly, SameSite=Lax, Secure in prod; signed with `SESSION_SECRET`.
- Store:
  ```ts
  interface Session { accessToken; refreshToken; expiresAt: number; cloudId; siteUrl }
  interface SessionStore { get(id); set(id, s); delete(id) }   // in-memory Map for v1
  ```
- Helpers: `createSession`, `readSession(request)`, `destroySession`; cookie read/write via
  `@tanstack/react-start/server` (`getCookie`/`setCookie`) or `Set-Cookie` in server-route
  responses.
- `getValidAccessToken(session)` — if `Date.now() > expiresAt - 60s`, POST the refresh
  grant, persist rotated tokens, return the fresh access token.

## Phase 2 — OAuth server routes (new route files)

These must be **server routes** (redirects/callbacks can't be server functions):

- **`src/routes/auth.login.ts`** → `GET`: generate `state` + PKCE verifier (store verifier
  in a short-lived signed cookie), 302 to
  `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=…&scope=…%20offline_access&redirect_uri=…&state=…&response_type=code&prompt=consent&code_challenge=…&code_challenge_method=S256`.
- **`src/routes/auth.callback.ts`** → `GET`: verify `state`, exchange `code` + verifier at
  `https://auth.atlassian.com/oauth/token`, call
  `GET https://api.atlassian.com/oauth/token/accessible-resources` → pick first
  `{ id: cloudId, url: siteUrl }`, `createSession(...)`, set cookie, 302 to `/`.
- **`src/routes/auth.logout.ts`** → `POST`: destroy session + clear cookie, 302 to `/`.

Server-route shape (confirmed current API):
```ts
export const Route = createFileRoute('/auth/login')({
  server: { handlers: { GET: async ({ request }) => new Response(...) } },
})
```

## Phase 3 — Auth middleware (`src/server/auth.middleware.ts`, new)

```ts
export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await readSession(request)
  if (!session) throw new UnauthorizedError()        // → serialized 401 to client
  const token = await getValidAccessToken(session)   // refresh if needed
  return next({ context: { jira: { token, cloudId: session.cloudId, siteUrl: session.siteUrl } } })
})
```

## Phase 4 — Rework the Jira client (`src/server/jira.server.ts`)

- Remove `config()`. `jiraFetch` gains an auth arg:
  ```ts
  jiraFetch(auth: { token; cloudId }, method, path, body?)
  ```
  → base URL `https://api.atlassian.com/ex/jira/${cloudId}`, header `Bearer ${token}`. The
  rest of `jiraFetch` (error parsing, 204) is unchanged.
- Every exported fn (`myself`, `listBoards`, `boardColumns`, `boardIssues`, `moveIssue`,
  `getIssueDetail`, `createIssue`, `deleteIssue`, `updateIssueDescription`, `addComment`,
  `search`) takes `auth` first and threads it into `jiraFetch`. Mechanical edit.
- `browseUrl` uses `session.siteUrl` (from accessible-resources) instead of the old base.

## Phase 5 — Attach to server functions (`src/server/jira.functions.ts`)

- Add `.middleware([authMiddleware])` to every `createServerFn`.
- Handlers read `context.jira` and pass it through: `jira.listBoards(context.jira)`, etc.
- Validators and client-side call sites unchanged.

## Phase 6 — Global registration (`src/start.ts`, new)

```ts
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: c => c.handlerType === 'serverFn' })],
}))
```
Adding `src/start.ts` means CSRF is no longer auto-installed — register it explicitly.

## Phase 7 — Frontend

- **Connect screen:** when `useMe()` (or any query) 401s, render a "Connect Jira" screen
  linking to `/auth/login` (plain anchor — it's a redirect).
- **Global 401 handling:** QueryClient error handling flips app to "disconnected" so the
  board doesn't show error spam.
- **Logout:** header button POSTing to `/auth/logout`.
- Board switcher / data flow otherwise unchanged.

---

## Files at a glance

| File | Change |
|---|---|
| `src/server/session.server.ts` | **new** — cookie, store, token refresh |
| `src/routes/auth.login.ts` / `auth.callback.ts` / `auth.logout.ts` | **new** — OAuth flow |
| `src/server/auth.middleware.ts` | **new** — resolve session → `context.jira` |
| `src/start.ts` | **new** — global middleware / CSRF |
| `src/server/jira.server.ts` | drop `config()`; `jiraFetch`/methods take `auth` |
| `src/server/jira.functions.ts` | add `.middleware([authMiddleware])`, pass `context.jira` |
| `src/components/` | connect screen, 401 handling, logout |
| `.env.example` / README | swap token vars → app creds |

## Verification

1. Start dev, hit `/` unauthenticated → "Connect Jira".
2. Click connect → Atlassian consent → redirected back authenticated; `getMe` returns your account.
3. Boards / issues / move / create / delete / detail all work (same server-fn surface, now Bearer).
4. Force-expire the access token → next call silently refreshes.
5. Logout → back to connect screen; session gone.
6. Confirm no token in the client bundle (grep dist) and cookie is httpOnly.

## Effort

~half a day for the in-memory single-site version above. Multi-site picker + durable
session store are additive later (the `SessionStore` interface and cloudId-in-session make
both non-breaking).
