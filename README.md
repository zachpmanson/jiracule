# jiracule

A lightweight Jira Cloud board frontend — view boards, filter by assignee,
create / move / search / delete issues, switch boards — without the RAM cost of
the official Jira web app.

A single full-stack [TanStack Start](https://tanstack.com/start) app: React +
TanStack Router + TanStack Query, with server functions proxying Jira Cloud.
Each user signs in with **Atlassian OAuth 2.0 (3LO)**; tokens live in an
encrypted session cookie, so no shared API token is needed and nothing sensitive
reaches the browser. Architecture notes live in [`CLAUDE.md`](./CLAUDE.md).

## Setup

1. Register an **OAuth 2.0 (3LO)** app at
   [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/):
   - Add the **Jira** permission and enable these **granular** scopes (plus
     `offline_access`): `read:issue:jira read:issue-details:jira read:issue-meta:jira read:issue.transition:jira read:field:jira read:status:jira read:issue-type:jira read:priority:jira read:project:jira read:user:jira read:comment:jira write:issue:jira write:comment:jira delete:issue:jira read:board-scope:jira-software read:board-scope.admin:jira-software`.
   - Set the callback URL to `http://localhost:3000/auth/callback`.
2. Configure and run (uses **pnpm**):
   ```bash
   cp .env.example .env   # fill in the values below
   pnpm install
   pnpm dev               # http://localhost:3000
   ```

`.env` (auto-loaded in dev and by the built server):

| var                       | value                                              |
| ------------------------- | -------------------------------------------------- |
| `ATLASSIAN_CLIENT_ID`     | from your OAuth app                                |
| `ATLASSIAN_CLIENT_SECRET` | from your OAuth app                                |
| `OAUTH_REDIRECT_URI`      | `http://localhost:3000/auth/callback`              |
| `SESSION_SECRET`          | random ≥32-char string (`openssl rand -base64 48`) |

Then open the app and click **Connect Jira** to authorize.

## Production

The Vite build uses a **Nitro node-server** target, emitting a standalone server:

```bash
pnpm build                     # -> .output/server/index.mjs
node .output/server/index.mjs  # honours PORT / HOST
```

### NixOS

Packaged as a flake (`flake.nix` + `nix/package.nix` + `nix/module.nix`). Import
the module and enable the service:

```nix
# flake inputs: jiracule.url = "github:zachpmanson/jiracule";
imports = [ jiracule.nixosModules.default ];
services.jiracule = {
  enable = true;
  port = 3000;
  hostname = "0.0.0.0";
  openFirewall = true;
  # Secrets kept out of the Nix store (ATLASSIAN_CLIENT_ID/SECRET,
  # OAUTH_REDIRECT_URI, SESSION_SECRET):
  environmentFile = "/run/secrets/jiracule.env";
};
```

The service runs via systemd (`DynamicUser`, hardened). When the pnpm lockfile
changes, `nix build` prints the new `pnpmDeps` hash to paste into
`nix/package.nix`.

## Not in v1

Sprints/backlog, attachments, arbitrary field editing, multi-site picker (uses
the first accessible Jira site), real-time updates, JQL box (search uses JQL
under the hood).
