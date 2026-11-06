# RelayOps driver feature

Framework-independent, mobile-first driver views for Engineer 1 to mount after the application bootstrap exists. This folder does not add Next.js routes, React dependencies, route mounting, shared styles, or backend behavior. Client-side visibility is UX only; the server must enforce driver identity, assignment ownership, and every mutation permission.

## Route handoff

| Route to mount | Export | Behavior |
| --- | --- | --- |
| `/driver` | `mountDriverJobs(root, options?)` | Loads assigned jobs, provides refresh, empty and stale/error states, and links to job details and breakdown reporting. |
| `/driver/incidents/new` | `mountDriverIncidentReport(root, options?)` | Submits a `BREAKDOWN` report and displays the server's incident ID/correlation receipt on success. |
| `/driver/jobs/[shipmentId]` | `mountDriverShipmentDetails(root, shipmentId, options?)` | Loads shipment/assignment details; accepts a pending backup assignment, confirms pickup, or completes delivery with a required proof reference. |

Each function returns `{ unmount() }`. Mount into an Engineer 1-owned `HTMLElement`; import `driver.css` once from the future app integration. Route changes should call the previous handle's `unmount()` before mounting another view. Optional `options.api` injection is for tests/integration; otherwise the feature uses same-origin `fetch`.

Example (future bootstrap only):

```ts
import "./features/driver/driver.css";
import { mountDriverJobs } from "./features/driver/views.ts";

const mounted = mountDriverJobs(document.querySelector("#route-root")!);
// Call mounted.unmount() when the route is left.
```

## Expected HTTP contracts

Every response uses the documented envelope `{ "data": ..., "correlationId": "..." }`. Errors use `{ "error": { "code": "...", "message": "...", "correlationId": "..." } }`. IDs in paths are URL-encoded. All requests carry `X-Request-ID`; each mutation also carries `Idempotency-Key` and a JSON body. A key is retained in tab `sessionStorage` if the network outcome is unknown (including an unreadable/malformed response) and reused for an identical retry; a valid API error envelope or success response clears it. A changed payload gets a new key.

- `GET /api/v1/driver/jobs` → `data` is an array of `{ assignment, shipment }`. `assignment` has the canonical `id`, `shipmentId`, `driverId`, `vehicleId`, `incidentId`, and `status` fields. `shipment` has `id`, `trackingCode`, `assignedDriverId`, `assignedVehicleId`, `priority`, `promisedAt`, `etaAt`, `status`, and nullable `proofOfDeliveryRef`.
- `GET /api/v1/shipments/:shipmentId` → `data` is `{ shipment, assignment }`, with the DTO fields above and `assignment` either the canonical assignment shape or `null`.
- `POST /api/v1/incidents` → body `{ "type": "BREAKDOWN", "vehicleId": "VAN-014", "summary": "..." }`; server derives the authenticated reporter. `data` is an incident DTO with `id`, `type`, `vehicleId`, `reporterId`, `severity`, `status`, `summary`, and `createdAt`.
- `POST /api/v1/assignments/:assignmentId/accept` → body `{}`; `data` is the updated canonical assignment DTO with status `ACCEPTED`.
- `POST /api/v1/assignments/:assignmentId/pickup` → body `{}`; `data` is the updated assignment DTO with status `PICKED_UP`; the fresh shipment GET should report `PICKED_UP_BY_BACKUP`.
- `POST /api/v1/assignments/:assignmentId/deliver` → body `{ "proofOfDeliveryRef": "..." }`; `data` is the updated assignment DTO with status `COMPLETED`; the fresh shipment GET should report `DELIVERED` and the same proof reference.

The request-ID header name is `X-Request-ID`; mutations use `Idempotency-Key`, per the API convention. The request ID is new per HTTP attempt; the idempotency key stays stable after a transport failure for the same operation and payload.

## State and truthful integration boundary

Loading, empty, validation, success, stale-data, duplicate/no-op, permission-denied, and network/API failure states are represented. Controls are disabled while mutations run, and inputs remain intact on errors. Assignment actions require the mutation response and a fresh shipment GET to agree on the resulting state. A follow-up GET failure after an accepted assignment mutation is called out as unconfirmed/stale. Breakdown reporting displays only the incident receipt returned by its POST; it does not claim that an unrelated jobs GET verifies incident persistence. Network uncertainty is not presented as failure or success, and retries keep the same idempotency key.

These are real HTTP adapters and DOM forms, not seeded success simulations. In this repository foundation there is no app bootstrap, mounted route, authentication flow, server, API implementation, or API integration test environment; requests will accurately display the resulting network/API failure until Engineer 1 mounts the routes and backend work provides the documented contracts. The client does not invent addresses, map positions, or delivery state.

## Tests

Focused mocked-fetch tests run with the repository's Node 22/TypeScript setup, without package changes:

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/features/driver/tests/*.test.mjs
```

Run `npm exec --yes --package=typescript@5.9.3 -- tsc --noEmit` for the strict TypeScript check if the local `tsc` binary is not installed. The full application/browser flow remains unavailable until the app and backend are integrated.
