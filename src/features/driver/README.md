# RelayOps driver feature

Framework-independent, mobile-first driver views mounted by the Next.js App Router pages in `src/app/driver/**`. This folder owns the view, request adapter, and scoped stylesheet; the root shell, app bootstrap, auth/session implementation, and backend route handlers remain outside its ownership. Client-side visibility is UX only; the server enforces driver identity, assignment ownership, and every mutation permission.

## App Router mounts

| Route | Mount | Behavior |
| --- | --- | --- |
| `/driver` | `mountDriverJobs(root, options?)` | Loads assigned jobs, provides refresh, empty and stale/error states, and links to job details and breakdown reporting. |
| `/driver/incidents/new` | `mountDriverIncidentReport(root, options?)` | Submits a `BREAKDOWN` report and displays the server's incident ID/correlation receipt on success. |
| `/driver/jobs/[shipmentId]` | `mountDriverShipmentDetails(root, shipmentId, options?)` | Loads shipment/assignment details; accepts a pending backup assignment, confirms pickup, or completes delivery with a required proof reference. |

Each function returns `{ unmount() }`. The route pages mount into their own `HTMLElement` and call `unmount()` when the route changes. The driver route imports `driver.css`; optional `options.api` injection is for tests/integration, otherwise the feature uses same-origin `fetch` with the signed session cookie.

The route wrappers under `src/app/driver/**` call the exported mount function in an effect and invoke its `unmount()` cleanup when the route changes.

## Expected HTTP contracts

Business API success uses `{ "data": ..., "correlationId": "..." }`; errors use `{ "error": { "code": "...", "message": "...", "correlationId": "..." } }`. IDs in paths are URL-encoded. API requests carry `X-Request-ID`; business-state mutations also carry `Idempotency-Key` and a JSON body. The session-selection bridge is same-origin and does not send an operator key from the browser. A business mutation key is retained in tab `sessionStorage` if the network outcome is unknown (including an unreadable/malformed response) and reused for an identical retry; a valid API error envelope or success response clears it. A changed payload gets a new key.

- `POST /api/demo/session` → the driver page may request `{ "role": "DRIVER", "driverId": "DRV-014" | "DRV-009" }`. The same-origin bridge validates the request and allowlist, keeps `DEMO_OPERATOR_KEY` server-side, derives the signed user identity, and returns an HTTP-only session cookie. The client sends no operator key and does not use the selected ID as mutation authority.
- `GET /api/v1/driver/jobs` → `data` is an array of `{ assignment, shipment }` scoped to the signed-in driver. `assignment` has the canonical `id`, `shipmentId`, `driverId`, `vehicleId`, `incidentId`, and `status` fields. `shipment` has `id`, `trackingCode`, `assignedDriverId`, `assignedVehicleId`, `priority`, `promisedAt`, `etaAt`, `status`, and nullable `proofOfDeliveryRef`.
- `GET /api/v1/shipments/:shipmentId` → `data` is the direct canonical `ShipmentDto` (`id`, `trackingCode`, `customerId`, `assignedDriverId`, `assignedVehicleId`, `priority`, `promisedAt`, `etaAt`, `status`, `units`, and nullable `proofOfDeliveryRef`). The feature adapts it to its internal detail view by matching the shipment ID against `GET /api/v1/driver/jobs`; assignment context comes only from that authenticated driver-scoped response, not a changed shipment contract.
- `POST /api/v1/incidents` → body `{ "type": "BREAKDOWN", "vehicleId": "VAN-014", "summary": "..." }`; server derives the authenticated reporter. `data` is an incident DTO with `id`, `type`, `vehicleId`, `reporterId`, `severity`, `status`, `summary`, and `createdAt`.
- `POST /api/v1/assignments/:assignmentId/accept` → body `{}`; `data` is the updated canonical assignment DTO with status `ACCEPTED`.
- `POST /api/v1/assignments/:assignmentId/pickup` → body `{}`; `data` is the updated assignment DTO with status `PICKED_UP`; the fresh shipment GET should report `PICKED_UP_BY_BACKUP`.
- `POST /api/v1/assignments/:assignmentId/deliver` → body `{ "proofOfDeliveryRef": "..." }`; `data` is the updated assignment DTO with status `COMPLETED`; the fresh shipment GET should report `DELIVERED` and the same proof reference.

The request-ID header name is `X-Request-ID`; mutations use `Idempotency-Key`, per the API convention. The request ID is new per HTTP attempt; the idempotency key stays stable after a transport failure for the same operation and payload.

## State and truthful integration boundary

Loading, empty, validation, success, stale-data, duplicate/no-op, permission-denied, and network/API failure states are represented. Controls are disabled while mutations run, and inputs remain intact on errors. Assignment actions require the mutation response and a fresh canonical shipment GET plus driver-scoped jobs response to agree on the resulting state. A follow-up GET failure after an accepted assignment mutation is called out as unconfirmed/stale. Breakdown reporting displays only the incident receipt returned by its POST; it does not claim that an unrelated jobs GET verifies incident persistence. Network uncertainty is not presented as failure or success, and retries keep the same idempotency key.

The App Router wrappers reuse these real HTTP adapters and DOM views; requests use same-origin credentials so the signed demo session cookie reaches the API. The route wrappers do not issue personas or trust client-supplied driver IDs. Demo driver selection is server-mediated and allowlisted by the session API. The client does not invent addresses, map positions, or delivery state.

## Tests

Focused mocked-fetch tests run with the repository's Node 22/TypeScript setup, without package changes:

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/features/driver/tests/*.test.mjs
```

Run `npm exec --yes --package=typescript@5.9.3 -- tsc --noEmit` for the strict TypeScript check if the local `tsc` binary is not installed. The full browser flow still requires the foundation and backend handler PRs to be available before it can be verified against persistent state.
