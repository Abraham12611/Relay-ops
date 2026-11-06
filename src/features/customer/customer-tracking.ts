import {
  fetchTrackingSnapshot,
  TrackingApiError,
  type CustomerEventKind,
  type CustomerTrackingNotification,
  type CustomerTrackingSnapshot,
  type TrackingApiOptions,
  type TrackingFetch,
} from "./api.ts";

export const CUSTOMER_TRACKING_POLL_INTERVAL_MS = 5_000;

export interface CustomerTrackingMountOptions {
  /** Override for tests or an embedding environment; defaults to window.fetch. */
  fetcher?: TrackingFetch;
  /** Set to 0 to disable polling; manual refresh remains available. */
  pollIntervalMs?: number;
}

interface StatusPresentation {
  label: string;
  icon: string;
  tone: "neutral" | "warning" | "success";
  step: number;
}

const statusPresentation: Record<CustomerTrackingSnapshot["shipment"]["status"], StatusPresentation> = {
  IN_TRANSIT: { label: "In transit", icon: "→", tone: "neutral", step: 0 },
  AT_RISK: { label: "Delivery at risk", icon: "!", tone: "warning", step: 1 },
  REASSIGNMENT_PENDING: { label: "Recovery being arranged", icon: "↻", tone: "warning", step: 2 },
  REASSIGNED: { label: "Recovery arranged", icon: "↻", tone: "neutral", step: 2 },
  PICKED_UP_BY_BACKUP: { label: "Back on the way", icon: "→", tone: "neutral", step: 2 },
  DELIVERED: { label: "Delivered", icon: "✓", tone: "success", step: 4 },
  EXCEPTION: { label: "Delivery exception", icon: "!", tone: "warning", step: 1 },
  DELIVERY_FAILED: { label: "Delivery needs attention", icon: "!", tone: "warning", step: 2 },
};

const progressSteps = ["In transit", "Service update", "Recovery", "Delivery"] as const;

const kindPresentation: Record<CustomerEventKind, { label: string; icon: string }> = {
  STATUS: { label: "Status update", icon: "•" },
  BREAKDOWN: { label: "Breakdown update", icon: "!" },
  RECOVERY: { label: "Recovery update", icon: "↻" },
  ETA_REVISED: { label: "ETA update", icon: "↗" },
  DELIVERY: { label: "Delivery update", icon: "✓" },
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function isEtaRevised(snapshot: CustomerTrackingSnapshot): boolean {
  return Date.parse(snapshot.shipment.promisedAt) !== Date.parse(snapshot.shipment.etaAt);
}

function buildHeader(trackingCode: string, refresh: () => void): HTMLElement {
  const header = element("header", "rot-header");
  const brandRow = element("div", "rot-brand-row");
  const brand = element("span", "rot-brand", "RelayOps");
  const sectionLabel = element("span", "rot-header-label", "Shipment tracking");
  brandRow.append(brand, sectionLabel);

  const heading = element("h1", "rot-heading");
  heading.append(document.createTextNode("Track shipment "));
  heading.append(element("span", "rot-code", trackingCode));

  const intro = element("p", "rot-intro", "Delivery details from the latest confirmed shipment update.");
  const controls = element("div", "rot-header-controls");
  const refreshButton = element("button", "rot-refresh", "Refresh updates");
  refreshButton.type = "button";
  refreshButton.setAttribute("aria-label", "Refresh shipment tracking updates");
  refreshButton.addEventListener("click", refresh);
  controls.append(refreshButton);

  header.append(brandRow, heading, intro, controls);
  return header;
}

function makeStateMessage(title: string, message: string, kind: "loading" | "error" | "empty"): HTMLElement {
  const panel = element("section", `rot-state rot-state-${kind}`);
  panel.setAttribute("aria-live", kind === "loading" || kind === "error" ? "polite" : "off");
  panel.setAttribute("aria-atomic", "true");
  if (kind === "loading") {
    const icon = element("span", "rot-state-icon", "…");
    icon.setAttribute("aria-hidden", "true");
    panel.append(icon);
  }
  panel.append(element("h2", "rot-state-title", title), element("p", "rot-state-copy", message));
  return panel;
}

function appendCorrelation(panel: HTMLElement, error: TrackingApiError): void {
  const reference = element("p", "rot-reference");
  reference.append(document.createTextNode("Reference: "));
  reference.append(element("code", "", error.correlationId));
  panel.append(reference);
}

function createErrorPanel(error: TrackingApiError): HTMLElement {
  let title = "Tracking service unavailable";
  let message = "We couldn't reach the tracking service. Shipment details are not available until it responds.";
  if (error.kind === "not-found") {
    title = "Tracking code not found";
    message = "No shipment is registered for this tracking code. Check the code and try again.";
  } else if (error.kind === "network") {
    title = "Connection problem";
    message = "The tracking service could not be reached. Check your connection and try again.";
  } else if (error.kind === "invalid-response") {
    title = "Tracking details could not be verified";
    message = "The tracking service returned data this page could not verify, so no shipment details were shown.";
  } else if (error.kind === "request-failed") {
    title = "We couldn't load tracking details";
    message = "The tracking request was not completed. Try refreshing in a moment.";
  }
  const panel = makeStateMessage(title, message, "error");
  appendCorrelation(panel, error);
  return panel;
}

function buildStepper(snapshot: CustomerTrackingSnapshot): HTMLElement {
  const current = statusPresentation[snapshot.shipment.status];
  const section = element("section", "rot-section rot-progress-section");
  section.setAttribute("aria-labelledby", "rot-progress-heading");
  section.append(element("h2", "rot-section-heading", "Delivery progress"));
  section.lastElementChild?.setAttribute("id", "rot-progress-heading");

  const steps = element("ol", "rot-stepper");
  steps.setAttribute("aria-label", `Delivery progress: ${current.label}`);
  progressSteps.forEach((label, index) => {
    const item = element("li", "rot-step");
    const isDelivered = snapshot.shipment.status === "DELIVERED";
    const completed = isDelivered || index < current.step;
    const active = !isDelivered && index === current.step;
    item.classList.add(completed ? "is-complete" : active ? "is-current" : "is-upcoming");

    const marker = element("span", "rot-step-marker", completed ? "✓" : active ? "•" : String(index + 1));
    marker.setAttribute("aria-hidden", "true");
    const text = element("span", "rot-step-label", label);
    if (active) item.setAttribute("aria-current", "step");
    const state = element("span", "rot-visually-hidden", completed ? "Complete" : active ? "Current step" : "Not yet reached");
    item.append(marker, text, state);
    steps.append(item);
  });
  section.append(steps);
  return section;
}

function buildEta(snapshot: CustomerTrackingSnapshot): HTMLElement {
  const eta = element("section", "rot-section rot-eta-section");
  eta.setAttribute("aria-labelledby", "rot-eta-heading");
  eta.append(element("h2", "rot-section-heading", "Delivery estimate"));
  eta.lastElementChild?.setAttribute("id", "rot-eta-heading");

  const revised = isEtaRevised(snapshot);
  const grid = element("div", "rot-eta-grid");
  const promised = element("div", "rot-eta-item");
  promised.append(element("span", "rot-eta-label", "Promised ETA"));
  promised.append(element("time", "rot-eta-time", formatTimestamp(snapshot.shipment.promisedAt)));
  (promised.lastElementChild as HTMLTimeElement).dateTime = snapshot.shipment.promisedAt;

  const current = element("div", "rot-eta-item rot-current-eta");
  const currentLabel = element("span", "rot-eta-label", revised ? "Current estimate" : "Current ETA");
  const currentTime = element("time", "rot-eta-time", formatTimestamp(snapshot.shipment.etaAt));
  currentTime.dateTime = snapshot.shipment.etaAt;
  current.append(currentLabel, currentTime);
  if (revised) {
    const badge = element("span", "rot-revised-badge", "Revised");
    badge.setAttribute("aria-label", "The delivery estimate has been revised");
    current.append(badge);
  }
  grid.append(promised, current);
  eta.append(grid, element("p", "rot-eta-disclaimer", "Estimates reflect confirmed shipment updates; this page does not show live GPS or route predictions."));
  return eta;
}

function buildLatestUpdate(snapshot: CustomerTrackingSnapshot): HTMLElement {
  const latest = [...snapshot.timeline].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  const section = element("section", "rot-latest");
  section.setAttribute("aria-labelledby", "rot-latest-heading");
  section.append(element("h2", "rot-section-heading", "Latest customer update"));
  section.lastElementChild?.setAttribute("id", "rot-latest-heading");
  if (latest === undefined) {
    section.append(element("p", "rot-empty-copy", "No customer update has been recorded yet."));
    return section;
  }
  const kind = kindPresentation[latest.kind];
  const line = element("p", "rot-latest-message");
  const icon = element("span", "rot-event-icon", kind.icon);
  icon.setAttribute("aria-hidden", "true");
  line.append(icon, document.createTextNode(latest.message));
  section.append(element("p", "rot-latest-title", latest.title), line);
  return section;
}

function buildHistory(snapshot: CustomerTrackingSnapshot): HTMLElement {
  const section = element("section", "rot-section rot-history");
  section.setAttribute("aria-labelledby", "rot-history-heading");
  section.append(element("h2", "rot-section-heading", "Shipment history"));
  section.lastElementChild?.setAttribute("id", "rot-history-heading");

  const events = [...snapshot.timeline].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  if (events.length === 0) {
    section.append(element("p", "rot-empty-copy", "No customer-visible shipment events have been recorded yet."));
    return section;
  }

  const list = element("ol", "rot-history-list");
  for (const event of events) {
    const item = element("li", "rot-history-item");
    const kind = kindPresentation[event.kind];
    const row = element("div", "rot-history-title-row");
    const icon = element("span", "rot-event-icon", kind.icon);
    icon.setAttribute("aria-hidden", "true");
    row.append(icon, element("h3", "rot-history-title", event.title), element("span", "rot-kind-label", kind.label));
    const message = element("p", "rot-history-message", event.message);
    const time = element("time", "rot-history-time", formatTimestamp(event.createdAt));
    time.dateTime = event.createdAt;
    item.append(row, message, time);
    list.append(item);
  }
  section.append(list);
  return section;
}

function notificationLabel(kind: CustomerTrackingNotification["kind"]): string {
  switch (kind) {
    case "BREAKDOWN": return "Breakdown";
    case "RECOVERY": return "Recovery";
    case "ETA_REVISED": return "ETA revised";
    case "DELIVERY": return "Delivery";
    case "STATUS": return "Status";
    case "GENERAL": return "Notice";
  }
}

function buildNotifications(snapshot: CustomerTrackingSnapshot): HTMLElement {
  const section = element("section", "rot-section rot-notifications");
  section.setAttribute("aria-labelledby", "rot-notifications-heading");
  section.append(element("h2", "rot-section-heading", "Delivery notices"));
  section.lastElementChild?.setAttribute("id", "rot-notifications-heading");
  const notices = [...snapshot.notifications].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  if (notices.length === 0) {
    section.append(element("p", "rot-empty-copy", "No delivery notices have been recorded yet."));
    return section;
  }
  const list = element("ul", "rot-notice-list");
  for (const notice of notices) {
    const item = element("li", "rot-notice-item");
    item.append(element("span", "rot-notice-kind", notificationLabel(notice.kind)));
    item.append(element("p", "rot-notice-message", notice.message));
    const time = element("time", "rot-notice-time", formatTimestamp(notice.createdAt));
    time.dateTime = notice.createdAt;
    item.append(time);
    list.append(item);
  }
  section.append(list);
  return section;
}

function buildDeliveryConfirmation(snapshot: CustomerTrackingSnapshot): HTMLElement | null {
  if (snapshot.shipment.status !== "DELIVERED") return null;
  const confirmation = element("section", "rot-delivery-confirmation");
  confirmation.setAttribute("role", "status");
  confirmation.setAttribute("aria-labelledby", "rot-delivered-heading");
  const icon = element("span", "rot-delivered-icon", "✓");
  icon.setAttribute("aria-hidden", "true");
  confirmation.append(icon, element("h2", "rot-delivered-heading", "Delivery confirmed"));
  confirmation.append(element("p", "", "The shipment is marked delivered in the tracking service."));
  if (snapshot.shipment.deliveredAt !== null) {
    const time = element("time", "rot-delivered-time", `Recorded ${formatTimestamp(snapshot.shipment.deliveredAt)}`);
    time.dateTime = snapshot.shipment.deliveredAt;
    confirmation.append(time);
  }
  return confirmation;
}

function buildShipmentView(snapshot: CustomerTrackingSnapshot, lastCheckedAt: string): HTMLElement {
  const view = element("div", "rot-tracking-content");
  const summary = element("section", "rot-summary");
  summary.setAttribute("aria-labelledby", "rot-status-heading");

  const top = element("div", "rot-summary-top");
  const status = statusPresentation[snapshot.shipment.status];
  const statusBadge = element("p", `rot-status-badge is-${status.tone}`);
  statusBadge.append(element("span", "rot-status-icon", status.icon), document.createTextNode(status.label));
  statusBadge.firstElementChild?.setAttribute("aria-hidden", "true");
  const priority = snapshot.shipment.priority === "CRITICAL"
    ? element("span", "rot-priority", "Critical shipment")
    : element("span", "rot-priority", "Standard shipment");
  top.append(statusBadge, priority);

  summary.append(top, element("h2", "rot-status-heading", status.label));
  summary.lastElementChild?.setAttribute("id", "rot-status-heading");
  const updated = element("p", "rot-updated", `Shipment status last updated ${formatTimestamp(snapshot.shipment.updatedAt)}.`);
  summary.append(updated);
  view.append(summary);

  const delivered = buildDeliveryConfirmation(snapshot);
  if (delivered !== null) view.append(delivered);
  view.append(buildEta(snapshot), buildStepper(snapshot), buildLatestUpdate(snapshot));

  const lower = element("div", "rot-details-grid");
  lower.append(buildHistory(snapshot), buildNotifications(snapshot));
  view.append(lower);

  const freshness = element("p", "rot-freshness", `Last checked ${formatTimestamp(lastCheckedAt)}. Updates are requested every 5 seconds while this page is open.`);
  freshness.setAttribute("aria-label", `Tracking data last checked ${formatTimestamp(lastCheckedAt)}`);
  view.append(freshness);
  return view;
}

function buildStaleBanner(error: TrackingApiError): HTMLElement {
  const banner = element("aside", "rot-stale-banner");
  banner.setAttribute("role", "status");
  banner.append(element("strong", "", "Showing the last available update"));
  banner.append(element("p", "", "A refresh did not complete. The shipment details below were not replaced with sample or estimated activity."));
  appendCorrelation(banner, error);
  return banner;
}

/** Mount a self-contained, framework-independent customer tracking view. */
export function mountCustomerTracking(
  container: HTMLElement,
  trackingCode: string,
  options: CustomerTrackingMountOptions = {},
): () => void {
  const normalizedCode = trackingCode.trim();
  if (!normalizedCode) throw new TypeError("A tracking code is required");
  const pollIntervalMs = options.pollIntervalMs ?? CUSTOMER_TRACKING_POLL_INTERVAL_MS;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new RangeError("pollIntervalMs must be a finite non-negative number");
  }

  const root = element("main", "relay-customer-tracking");
  root.setAttribute("aria-label", `Shipment tracking for ${normalizedCode}`);
  const stateRegion = element("div", "rot-content");
  const initialLoading = makeStateMessage(
    "Loading shipment details",
    "Connecting to the tracking service for the latest saved shipment state.",
    "loading",
  );
  stateRegion.append(initialLoading);

  let disposed = false;
  let inFlight = false;
  let snapshot: CustomerTrackingSnapshot | null = null;
  let lastCheckedAt: string | null = null;
  let refreshError: TrackingApiError | null = null;
  let manualRefreshInFlight = false;
  let requestController: AbortController | null = null;
  const refreshButtonHandler = (): void => { void refresh(true); };
  const header = buildHeader(normalizedCode, refreshButtonHandler);
  root.append(header, stateRegion);
  container.replaceChildren(root);

  function render(): void {
    if (disposed) return;
    stateRegion.replaceChildren();
    stateRegion.setAttribute("aria-busy", inFlight ? "true" : "false");
    const refreshButton = header.querySelector<HTMLButtonElement>(".rot-refresh");
    if (refreshButton !== null) refreshButton.disabled = inFlight;

    if (snapshot === null) {
      if (refreshError !== null) {
        stateRegion.append(createErrorPanel(refreshError));
      } else {
        stateRegion.append(makeStateMessage(
          "Loading shipment details",
          "Connecting to the tracking service for the latest saved shipment state.",
          "loading",
        ));
      }
      return;
    }

    if (refreshError !== null) stateRegion.append(buildStaleBanner(refreshError));
    else if (inFlight && manualRefreshInFlight) {
      const refreshing = element("p", "rot-refreshing", "Checking for updated shipment details…");
      refreshing.setAttribute("role", "status");
      stateRegion.append(refreshing);
    }

    if (lastCheckedAt !== null) stateRegion.append(buildShipmentView(snapshot, lastCheckedAt));
  }

  async function refresh(manual: boolean): Promise<void> {
    if (disposed || inFlight) return;
    inFlight = true;
    manualRefreshInFlight = manual;
    requestController = new AbortController();
    if (snapshot === null || manual) render();
    else {
      const refreshButton = header.querySelector<HTMLButtonElement>(".rot-refresh");
      if (refreshButton !== null) refreshButton.disabled = true;
    }

    const requestOptions: TrackingApiOptions = {};
    if (options.fetcher !== undefined) requestOptions.fetcher = options.fetcher;
    requestOptions.signal = requestController.signal;

    try {
      const result = await fetchTrackingSnapshot(normalizedCode, requestOptions);
      if (disposed) return;
      snapshot = result.snapshot;
      lastCheckedAt = new Date().toISOString();
      refreshError = null;
    } catch (error) {
      if (disposed) return;
      if (error instanceof TrackingApiError && error.kind === "aborted") return;
      refreshError = error instanceof TrackingApiError
        ? error
        : new TrackingApiError({
            kind: "network",
            correlationId: "unknown-request",
            requestId: "unknown-request",
          });
    } finally {
      if (!disposed) {
        inFlight = false;
        manualRefreshInFlight = false;
        requestController = null;
        render();
      }
    }
  }

  void refresh(false);
  const pollTimer = pollIntervalMs === 0
    ? undefined
    : window.setInterval(() => { void refresh(false); }, pollIntervalMs);

  return () => {
    if (disposed) return;
    disposed = true;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    requestController?.abort();
    root.remove();
  };
}
