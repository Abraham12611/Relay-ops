# Customer tracking feature

The App Router mounts this framework-independent TypeScript view at **`/track/[trackingCode]`** from `src/app/track/[trackingCode]/page.tsx`; the route also imports this feature's scoped stylesheet. The feature remains responsible only for its view and API adapter, not the Next.js root shell or tracking endpoint implementation.

## Mount lifecycle

The client route mounts the view in an effect and calls its cleanup function when the route unmounts or the tracking code changes. `mountCustomerTracking(container, trackingCode, options?)` immediately fetches saved state and polls every five seconds by default. Pass `{ pollIntervalMs: 0 }` to disable polling or `{ fetcher }` to inject a fetch implementation. Cleanup stops polling and aborts an in-flight request.

## API contract expected by this feature

The only request is `GET /api/v1/track/:code` (for the seeded example, `GET /api/v1/track/TRK-2048`). The adapter sends `Accept: application/json` and an `X-Request-ID` header. Success uses the repository's `{ data, correlationId }` envelope, with this customer-safe feature DTO in `data`:

```ts
{
  shipment: {
    id: string;
    trackingCode: string;
    priority: "NORMAL" | "CRITICAL";
    status: "IN_TRANSIT" | "AT_RISK" | "REASSIGNMENT_PENDING" | "REASSIGNED"
      | "PICKED_UP_BY_BACKUP" | "DELIVERED" | "EXCEPTION" | "DELIVERY_FAILED";
    promisedAt: string; // parseable ISO timestamp
    etaAt: string; // current estimate, possibly revised
    updatedAt: string;
    deliveredAt: string | null;
  };
  timeline: Array<{
    id: string;
    kind: "STATUS" | "BREAKDOWN" | "RECOVERY" | "ETA_REVISED" | "DELIVERY";
    visibility: "CUSTOMER";
    title: string;
    message: string;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    kind: "STATUS" | "BREAKDOWN" | "RECOVERY" | "ETA_REVISED" | "DELIVERY" | "GENERAL";
    message: string;
    createdAt: string;
  }>;
}
```

The endpoint must project only customer-visible event content; it must not send internal notes or staff/agent discussion. The client validates the envelope, tracking code, status, timestamps and public event visibility, then copies only the permitted DTO fields into the view. A malformed or internal timeline entry makes the response unusable and is not rendered. A documented API error should use `{ error: { code, message, correlationId } }`; `TRACKING_NOT_FOUND`/`NOT_FOUND` with HTTP 404 is shown as not found. A missing/non-JSON 404 or 5xx is treated as tracking-service unavailable, so an absent backend is not presented as a successful empty shipment.

## What is real vs. not available yet

- **Real in this module:** the route-ready customer view, loading/not-found/error states, explicit stale-data handling, ETA comparison, status stepper, and rendering of validated public timeline/notification data returned by the endpoint. Refreshes always request durable API state; the UI contains no seeded success data or fake events.
- **Backend boundary:** the public tracking GET is owned by the API layer, not this feature. If that endpoint is unavailable, the page truthfully shows service unavailable rather than sample shipment state. The view does not perform mutations, send notifications, expose live GPS, or calculate route predictions.
- **Delivery confirmation:** shown only when the API returns `shipment.status: "DELIVERED"`; a delivery timestamp is shown only when the API provides `deliveredAt`.

## Tests

With the repository's Node.js 22.6+ setup, run the feature's mocked-fetch API tests directly:

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/features/customer/api.test.mjs
```

The root test script does not discover tests inside `src/features/` yet. The root `npm run typecheck` remains available to the integrator after this feature is combined with other work.
