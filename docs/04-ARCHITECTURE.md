# 04 — System architecture and integration boundaries

## Architecture decision
A single Next.js TypeScript app with route handlers, a small relational database and typed business services. One real Switch-connected recovery agent in Mattermost. Use a second specialized triage agent only if it improves real collaboration after the baseline succeeds.

```text
Customer / Driver / Dispatcher browser
                |
         Next.js UI + API
                |
         business services
                |
       SQLite (local) or Postgres
         |             |
    incident log    tool gateway (/api/agent/*)
         |             ^
  manual/verified     |
  Switch adapter      | authenticated requests
         v             |
       Switch <----> Real AI agent
         |
   Mattermost channel <----> Human dispatcher
```

Switch is **not** the business database or the approval authority. The bridge between business events and the room must be built/verified; initial safe method is a human posting the case ID and asking a genuine connected agent to investigate.

## Repo layout proposal
```text
src/
  app/(public)/track/[trackingCode]/page.tsx
  app/(public)/track/[trackingCode]/report/page.tsx
  app/(driver)/driver/page.tsx
  app/(driver)/driver/incidents/new/page.tsx
  app/(driver)/driver/jobs/[shipmentId]/page.tsx
  app/(ops)/ops/page.tsx
  app/(ops)/ops/exceptions/page.tsx
  app/(ops)/ops/exceptions/[caseId]/page.tsx
  app/(ops)/ops/shipments/[shipmentId]/page.tsx
  app/demo/page.tsx
  app/api/v1/...                 canonical business endpoints
  app/api/agent/...              constrained authenticated agent tools
  components/{ui,customer,driver,ops,common}/
  lib/{db,auth,domain,services,switch,notifications}/
  types/contracts.ts
  tests/{unit,integration,e2e}/
prisma/schema.prisma + prisma/migrations/ (Prisma ORM; SQLite)
scripts/{seed,reset,smoke}.ts
switch/{README.md,agent-instructions.md,room-kickoff.md}
docs/
.env.example
```

## Architecture contract
- JSON REST + `GET /api/v1/cases/:id`, etc. Typed DTOs in one file. No direct database access from UI components.
- Business service owns state machines. Agent tools call **same service layer** as operator UI, never write raw DB directly.
- Persist an `Event` for each material decision and state transition; keep separate `CustomerNotification` projection.
- Demo auth: `POST /api/v1/demo/session` requires the server-only `x-demo-operator-key`; it issues an HTTP-only signed persona cookie. Every protected handler validates signature, expiry, and server-side role. `DEMO_MODE=true` is required; arbitrary client role headers are ignored.
- Agent auth: server validates a signed demo persona cookie issued only by the operator-authenticated session route. Agent read, proposal and execution scopes use distinct server-only secrets in request headers; never put these keys in browser bundles. A client-supplied role header is not an identity.
- Data seeded with stable identifiers and resettable using admin-only local command.
- Poll case state at 2–5 seconds for demo, or SSE if already available; never claim realtime GPS.
- Send correlation IDs + idempotency keys through all services. Use transactions for approval execution.

## Switch integration — accurate boundary
Official hackathon materials say Switch uses rooms and a custom agent protocol (SSE input, HTTP output), supports Mattermost and runs locally via Switch Console + Docker. **The exact endpoint paths, authentication, and SDK usage MUST be copied from the installed version's official docs**, not assumed. See 09-AGENTS-SWITCH.md.
Integration spikes:
1. Bring up Switch Console, Docker and bundled Mattermost.
2. Add agent and verify human→agent→human exchange in one actual room.
3. Give agent access to RelayOps tool gateway (network accessible from its runtime).
4. Prove `getIncident` returns seeded case and `proposeRecovery` writes durable DB event.
5. Verify approval from dispatcher UI and `executeApprovedReassignment` receipt in the room.
6. Optional event→room push via documented Switch integration; human kickoff is acceptable fallback.

## Environment
```env
DATABASE_URL=file:../relayops.db
DEMO_MODE=true
DEMO_OPERATOR_KEY=replace-with-a-random-operator-secret
AGENT_READ_API_KEY=replace-with-read-secret
AGENT_PROPOSE_API_KEY=replace-with-propose-secret
AGENT_EXECUTE_API_KEY=replace-with-execute-secret
APP_BASE_URL=http://localhost:3000
# Configure Switch / Mattermost per official documented installed version
```
No secret checked into repository. `.env.example` must use placeholders.

## Deployment topology
Primary demo: local Next.js + database + Docker Switch + Mattermost + agent, shared via screen recording. Public app URL optional if reliable; if deployed, seed state and chat must be reachable from same workflow. Don't promise Vercel can host the Switch desktop/container setup.

## Operational observability
`GET /api/v1/health` shows DB/agent-tool health; room connectivity only if verifiable. Server logs contain case ID, event type, actor, result, duration and request ID (no secrets). Demo screen presents source-of-truth case timeline.

## Security shortcuts allowed only for hackathon
Seeded synthetic data, demo personas gated to local env, mock in-app notification delivery, deterministic ETA estimates. No fake Switch reply, no production exposed demo operator endpoints, no unverified approval based on chat text.
