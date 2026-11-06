import {
  classifyDriverApiError,
  createDriverApi,
  DriverApiError,
  type DriverApi,
  type DriverAssignmentStatus,
  type DriverJobDto,
  type ShipmentDetailDto,
} from "./api.ts";

export interface MountedDriverExperience {
  unmount(): void;
}

export interface DriverMountOptions {
  api?: DriverApi;
}

/** Mount into an Engineer 1-owned route element; this module does not mount routes. */
export function mountDriverJobs(root: HTMLElement, options: DriverMountOptions = {}): MountedDriverExperience {
  const api = options.api ?? createDriverApi();
  let active = true;
  let jobs: DriverJobDto[] | null = null;

  const render = (content: string) => {
    if (active) root.innerHTML = `<main class="relayops-driver">${content}</main>`;
  };
  const load = async () => {
    render(pageHeader("Your assignments", "Stops and backup work assigned to your driver account.") +
      `<p class="driver-notice" data-kind="loading" role="status">Loading assignments from RelayOps…</p><div class="driver-skeleton" aria-hidden="true"></div>`);
    try {
      const response = await api.getJobs();
      if (!active) return;
      jobs = response.data;
      renderJobs(root, jobs, "Assignments refreshed from the server.", "success", load);
    } catch (error) {
      if (!active) return;
      const message = apiErrorMessage(error);
      if (jobs) renderJobs(root, jobs, `Could not refresh assignments. Showing the last successful result. ${message}`, "stale", load);
      else renderJobs(root, [], message, classifyDriverApiError(error), load, false);
    }
  };

  void load();
  return { unmount: () => { active = false; root.replaceChildren(); } };
}

/** Mount the breakdown report form at /driver/incidents/new. */
export function mountDriverIncidentReport(root: HTMLElement, options: DriverMountOptions = {}): MountedDriverExperience {
  const api = options.api ?? createDriverApi();
  let active = true;
  let busy = false;

  const render = (message = "", kind: NoticeKind = "info") => {
    if (!active) return;
    root.innerHTML = `<main class="relayops-driver">
      ${pageHeader("Report a breakdown", "Tell dispatch what happened. The server records and deduplicates the incident.")}
      <p class="driver-notice" data-kind="${kind}" role="${kind === "validation" || kind === "permission" || kind === "network" || kind === "api" ? "alert" : "status"}" aria-live="polite">${escapeHtml(message)}</p>
      <form class="driver-form" data-incident-form novalidate>
        <label for="driver-vehicle-id">Vehicle ID or fleet code</label>
        <input id="driver-vehicle-id" name="vehicleId" type="text" autocomplete="off" required maxlength="80" placeholder="For example, VAN-014" aria-describedby="driver-vehicle-help">
        <small id="driver-vehicle-help">Use the vehicle assigned to you. Access is enforced by the server.</small>
        <label for="driver-breakdown-summary">What happened?</label>
        <textarea id="driver-breakdown-summary" name="summary" required minlength="8" maxlength="1000" rows="5" placeholder="Describe the breakdown and whether the vehicle is safe to move."></textarea>
        <p class="driver-form-hint">Report type: <strong>Breakdown</strong>. Do not include customer-sensitive information.</p>
        <button class="driver-button driver-button--primary" type="submit" data-submit-incident>Submit breakdown report</button>
      </form>
      <p class="driver-footer-link"><a href="/driver">Back to assignments</a></p>
    </main>`;
    const form = root.querySelector<HTMLFormElement>("[data-incident-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (busy || !form) return;
      const formData = new FormData(form);
      const vehicleId = String(formData.get("vehicleId") ?? "").trim();
      const summary = String(formData.get("summary") ?? "").trim();
      if (!vehicleId || summary.length < 8) {
        const message = !vehicleId ? "Enter a vehicle ID or fleet code." : "Describe the breakdown in at least 8 characters.";
        setNotice(root, message, "validation");
        form.querySelector<HTMLInputElement>("[name=vehicleId]")?.focus();
        return;
      }
      void submitIncident({ type: "BREAKDOWN", vehicleId, summary }, form);
    });
  };

  const submitIncident = async (
    input: { type: "BREAKDOWN"; vehicleId: string; summary: string },
    form: HTMLFormElement,
  ) => {
    busy = true;
    setButtonsDisabled(root, true);
    setNotice(root, "Sending the breakdown report…", "loading");
    try {
      const created = await api.createIncident(input);
      if (!active) return;
      setNotice(root, `The server accepted breakdown incident ${created.data.id}. Reference ${created.correlationId}.`, "success");
      form.reset();
    } catch (error) {
      if (!active) return;
      const kind = classifyDriverApiError(error);
      setNotice(root, apiErrorMessage(error), kind);
    } finally {
      busy = false;
      setButtonsDisabled(root, false);
    }
  };

  render();
  return { unmount: () => { active = false; root.replaceChildren(); } };
}

/** Mount shipment details/actions at /driver/jobs/[shipmentId]. */
export function mountDriverShipmentDetails(
  root: HTMLElement,
  shipmentId: string,
  options: DriverMountOptions = {},
): MountedDriverExperience {
  const api = options.api ?? createDriverApi();
  let active = true;
  let busy = false;
  let current: ShipmentDetailDto | null = null;

  const renderLoading = () => {
    if (!active) return;
    root.innerHTML = `<main class="relayops-driver">
      ${pageHeader("Shipment details", "Loading the current assignment and shipment state.")}
      <p class="driver-notice" data-kind="loading" role="status">Loading shipment ${escapeHtml(shipmentId)}…</p>
      <div class="driver-skeleton" aria-hidden="true"></div>
    </main>`;
  };

  const load = async (message?: string, messageKind: NoticeKind = "success", preserveProof = false) => {
    const proof = preserveProof ? root.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]")?.value ?? "" : "";
    if (!current) renderLoading();
    else setNotice(root, "Refreshing shipment from the server…", "loading");
    try {
      const response = await api.getShipment(shipmentId);
      if (!active) return;
      current = response.data;
      renderShipment(root, current, shipmentId, (action, value) => runAction(action, value), () => { void load(); });
      if (preserveProof) {
        const input = root.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]");
        if (input) input.value = proof;
      }
      setNotice(root, message ?? "Shipment state refreshed from the server.", message ? messageKind : "success");
    } catch (error) {
      if (!active) return;
      if (current) {
        const priorMessage = message ? `${message} ` : "";
        setNotice(root, `${priorMessage}Shipment data may be stale; showing the last successful GET. ${apiErrorMessage(error)}`, "stale");
        if (preserveProof) {
          const input = root.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]");
          if (input) input.value = proof;
        }
      } else {
        root.innerHTML = `<main class="relayops-driver">${pageHeader("Shipment details", "Unable to load shipment state.")}
          <p class="driver-notice" data-kind="${classifyDriverApiError(error)}" role="alert">${escapeHtml(apiErrorMessage(error))}</p>
          <button class="driver-button" type="button" data-refresh>Retry loading</button>
          <p class="driver-footer-link"><a href="/driver">Back to assignments</a></p></main>`;
        bindRefresh(root, () => { void load(); });
      }
    }
  };

  const runAction = async (action: "accept" | "pickup" | "deliver", proof = "") => {
    if (busy || !current?.assignment) return;
    if (action === "deliver" && !proof.trim()) {
      setNotice(root, "Enter the required proof-of-delivery reference before completing delivery.", "validation");
      root.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]")?.focus();
      return;
    }
    busy = true;
    setButtonsDisabled(root, true);
    setNotice(root, `${actionLabel(action)}…`, "loading");
    try {
      let mutation;
      if (action === "accept") mutation = await api.acceptAssignment(current.assignment.id);
      else if (action === "pickup") mutation = await api.confirmPickup(current.assignment.id);
      else mutation = await api.deliver(current.assignment.id, { proofOfDeliveryRef: proof.trim() });

      if (!active) return;
      const mutationAssignment = mutation.data;
      setNotice(root, `API acknowledged ${actionLabel(action).toLowerCase()} (correlation ${mutation.correlationId}); verifying with a fresh shipment GET…`, "loading");
      let refreshed;
      try {
        refreshed = await api.getShipment(shipmentId);
      } catch (refreshError) {
        if (!active) return;
        setNotice(root,
          `The mutation was accepted (correlation ${mutation.correlationId}), but the follow-up shipment GET failed. The new state is not confirmed. ${apiErrorMessage(refreshError)}`,
          "stale");
        return;
      }
      if (!active) return;
      current = refreshed.data;
      renderShipment(root, current, shipmentId, (nextAction, value) => runAction(nextAction, value), () => { void load(); });
      const expectedStatus = expectedAssignmentStatus(action);
      const assignmentConfirmed = current.assignment?.id === mutationAssignment.id &&
        current.assignment.status === expectedStatus && mutationAssignment.status === expectedStatus;
      const shipmentConfirmed = action !== "pickup" || current.shipment.status === "PICKED_UP_BY_BACKUP";
      const deliveryConfirmed = action !== "deliver" || (
        current.shipment.status === "DELIVERED" && current.shipment.proofOfDeliveryRef === proof.trim()
      );
      if (assignmentConfirmed && shipmentConfirmed && deliveryConfirmed) {
        setNotice(root, `${actionLabel(action)} confirmed by the mutation response and fresh shipment GET. Correlation ${refreshed.correlationId}.`, "success");
      } else {
        if (action === "deliver") {
          const input = root.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]");
          if (input) input.value = proof;
        }
        setNotice(root,
          `The mutation returned successfully, but the fresh GET does not confirm the expected ${expectedStatus} state. Treat the shipment as stale and refresh before acting again.`,
          "stale");
      }
    } catch (error) {
      if (!active) return;
      const kind = classifyDriverApiError(error);
      if (kind === "duplicate") {
        const detail = apiErrorMessage(error);
        await load(`API reports a duplicate/no-op or stale action: ${detail} Refreshing current state; no success is claimed.`, "duplicate", true);
      } else if (kind === "network") {
        const detail = apiErrorMessage(error);
        await load(`Network outcome is unknown: ${detail} A fresh GET was attempted; retrying the same unchanged action reuses its idempotency key. No success is claimed.`, "stale", true);
      } else {
        setNotice(root, apiErrorMessage(error), kind);
      }
    } finally {
      busy = false;
      setButtonsDisabled(root, false);
    }
  };

  void load();
  return { unmount: () => { active = false; root.replaceChildren(); } };
}

type NoticeKind = "info" | "loading" | "success" | "validation" | "stale" | "duplicate" | "permission" | "network" | "api";

function renderJobs(
  root: HTMLElement,
  jobs: DriverJobDto[],
  message: string,
  kind: NoticeKind,
  reload: () => Promise<void>,
  showEmptyState = true,
): void {
  const cards = jobs.map(({ assignment, shipment }) => `<article class="driver-card">
    <div class="driver-card__top"><span class="driver-eyebrow">${escapeHtml(shipment.priority)} priority</span><span class="driver-status">${escapeHtml(label(shipment.status))}</span></div>
    <h2><a href="/driver/jobs/${encodeURIComponent(shipment.id)}">${escapeHtml(shipment.trackingCode)} <span class="driver-arrow" aria-hidden="true">→</span></a></h2>
    <dl class="driver-facts">
      <div><dt>Shipment</dt><dd>${escapeHtml(shipment.id)}</dd></div>
      <div><dt>Assignment</dt><dd>${escapeHtml(label(assignment.status))}</dd></div>
      <div><dt>Vehicle</dt><dd>${escapeHtml(assignment.vehicleId)}</dd></div>
      <div><dt>ETA</dt><dd>${escapeHtml(formatDate(shipment.etaAt))}</dd></div>
    </dl>
    <a class="driver-button driver-button--secondary" href="/driver/jobs/${encodeURIComponent(shipment.id)}">Open shipment details</a>
  </article>`).join("");
  root.innerHTML = `<main class="relayops-driver">
    ${pageHeader("Your assignments", "Stops and backup work assigned to your driver account.")}
    <div class="driver-toolbar"><p class="driver-notice" data-kind="${kind}" role="${kind === "api" || kind === "permission" || kind === "network" ? "alert" : "status"}" aria-live="polite">${escapeHtml(message)}</p>
      <button class="driver-button driver-button--quiet" type="button" data-refresh>Refresh assignments</button>
    </div>
    ${showEmptyState ? `<p class="driver-section-label">${jobs.length} ${jobs.length === 1 ? "assignment" : "assignments"}</p>` : ""}
    ${jobs.length ? `<section class="driver-card-list" aria-label="Assigned shipments">${cards}</section>` : showEmptyState ? `<section class="driver-empty"><span class="driver-empty__mark" aria-hidden="true">✓</span><h2>No active assignments</h2><p>New work assigned to your account will appear here.</p></section>` : `<section class="driver-empty"><h2>Assignments unavailable</h2><p>A successful jobs response is needed before an empty state can be shown.</p></section>`}
    <a class="driver-link-action" href="/driver/incidents/new">Report a vehicle breakdown <span aria-hidden="true">→</span></a>
  </main>`;
  bindRefresh(root, () => { void reload(); });
}

function renderShipment(
  root: HTMLElement,
  detail: ShipmentDetailDto,
  shipmentId: string,
  perform: (action: "accept" | "pickup" | "deliver", proof?: string) => void,
  refresh: () => void,
): void {
  const { shipment, assignment } = detail;
  const actions = !assignment ? `<section class="driver-empty"><h2>No active assignment</h2><p>The shipment is not currently attached to a driver assignment.</p></section>` :
    assignment.status === "PENDING" ? `<section class="driver-action-card"><div><p class="driver-eyebrow">Backup pickup</p><h2>Accept this assignment?</h2><p>Accepting is explicit and will be verified against the refreshed shipment state.</p></div><button class="driver-button driver-button--primary" type="button" data-action="accept">Accept assignment</button></section>` :
    assignment.status === "ACCEPTED" ? `<section class="driver-action-card"><div><p class="driver-eyebrow">Pickup</p><h2>Confirm pickup</h2><p>Confirm only after you have taken custody of the shipment.</p></div><button class="driver-button driver-button--primary" type="button" data-action="pickup">Confirm pickup</button></section>` :
    assignment.status === "PICKED_UP" ? `<form class="driver-action-card driver-form driver-delivery-form" data-delivery-form novalidate>
      <div><p class="driver-eyebrow">Delivery confirmation</p><h2>Complete delivery</h2><p>A proof-of-delivery reference is required. Delivery is not marked complete until the API and a fresh GET confirm it.</p></div>
      <label for="driver-proof-ref">Proof-of-delivery reference</label><input id="driver-proof-ref" name="proofOfDeliveryRef" type="text" required maxlength="160" autocomplete="off" placeholder="Receipt, signature, or handoff reference">
      <button class="driver-button driver-button--primary" type="submit" data-action="deliver">Complete delivery</button>
    </form>` :
    assignment.status === "COMPLETED" ? `<section class="driver-empty driver-empty--success"><h2>Delivery recorded</h2><p>The server currently reports this assignment as completed.</p></section>` :
    `<section class="driver-empty"><h2>Assignment unavailable</h2><p>The server reports this assignment as ${escapeHtml(label(assignment.status))}; no action is available.</p></section>`;

  root.innerHTML = `<main class="relayops-driver">
    <div class="driver-breadcrumb"><a href="/driver">← Assignments</a></div>
    <header class="driver-page-heading"><p class="driver-kicker">Shipment ${escapeHtml(shipment.id)}</p><h1>${escapeHtml(shipment.trackingCode)}</h1><p>Delivery assignment details</p></header>
    <div class="driver-toolbar"><p class="driver-notice" data-kind="info" role="status" aria-live="polite"></p><button class="driver-button driver-button--quiet" type="button" data-refresh>Refresh state</button></div>
    <section class="driver-detail-card" aria-labelledby="shipment-overview-heading">
      <div class="driver-card__top"><span class="driver-eyebrow">${escapeHtml(shipment.priority)} priority</span><span class="driver-status">${escapeHtml(label(shipment.status))}</span></div>
      <h2 id="shipment-overview-heading">Shipment overview</h2>
      <dl class="driver-facts driver-facts--grid">
        <div><dt>Tracking code</dt><dd>${escapeHtml(shipment.trackingCode)}</dd></div>
        <div><dt>Assignment</dt><dd>${assignment ? escapeHtml(label(assignment.status)) : "Not assigned"}</dd></div>
        <div><dt>Vehicle</dt><dd>${escapeHtml(assignment?.vehicleId ?? shipment.assignedVehicleId)}</dd></div>
        <div><dt>Driver</dt><dd>${escapeHtml(assignment?.driverId ?? shipment.assignedDriverId)}</dd></div>
        <div><dt>Promised by</dt><dd>${escapeHtml(formatDate(shipment.promisedAt))}</dd></div>
        <div><dt>Current ETA</dt><dd>${escapeHtml(formatDate(shipment.etaAt))}</dd></div>
        ${shipment.proofOfDeliveryRef ? `<div><dt>Proof of delivery</dt><dd>${escapeHtml(shipment.proofOfDeliveryRef)}</dd></div>` : ""}
      </dl>
    </section>
    <div class="driver-notice" data-kind="info" role="status" aria-live="polite"></div>
    ${actions}
    <p class="driver-footer-link"><a href="/driver">Back to assignments</a></p>
  </main>`;

  bindRefresh(root, refresh);
  const accept = root.querySelector<HTMLButtonElement>("[data-action=accept]");
  accept?.addEventListener("click", () => perform("accept"));
  const pickup = root.querySelector<HTMLButtonElement>("[data-action=pickup]");
  pickup?.addEventListener("click", () => perform("pickup"));
  const form = root.querySelector<HTMLFormElement>("[data-delivery-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const proof = form.querySelector<HTMLInputElement>("[name=proofOfDeliveryRef]")?.value ?? "";
    perform("deliver", proof);
  });
  // shipmentId is kept explicit for route authors and makes accidental mismatch visible in the DOM.
  root.dataset.shipmentId = shipmentId;
}

function bindRefresh(root: HTMLElement, reload: () => void): void {
  root.querySelector<HTMLButtonElement>("[data-refresh]")?.addEventListener("click", reload);
}

function setNotice(root: HTMLElement, message: string, kind: NoticeKind): void {
  const notices = root.querySelectorAll<HTMLElement>(".driver-notice");
  const notice = notices.item(notices.length - 1) ?? notices.item(0);
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.setAttribute("role", kind === "validation" || kind === "permission" || kind === "network" || kind === "api" ? "alert" : "status");
}

function setButtonsDisabled(root: HTMLElement, disabled: boolean): void {
  root.querySelectorAll<HTMLButtonElement>("button[data-action], button[data-submit-incident], button[data-refresh]")
    .forEach((button) => { button.disabled = disabled; });
}

function expectedAssignmentStatus(action: "accept" | "pickup" | "deliver"): DriverAssignmentStatus {
  if (action === "accept") return "ACCEPTED";
  if (action === "pickup") return "PICKED_UP";
  return "COMPLETED";
}

function actionLabel(action: "accept" | "pickup" | "deliver"): string {
  if (action === "accept") return "Accept assignment";
  if (action === "pickup") return "Confirm pickup";
  return "Complete delivery";
}

function apiErrorMessage(error: unknown): string {
  if (!(error instanceof DriverApiError)) return error instanceof Error ? error.message : "Unexpected error. The action was not confirmed.";
  const correlation = error.correlationId ? ` Correlation ID: ${error.correlationId}.` : "";
  const kind = classifyDriverApiError(error);
  if (kind === "permission") return `Permission denied by the API: ${error.message} (HTTP ${error.status}, ${error.code}).${correlation}`;
  if (kind === "duplicate") return `API conflict (HTTP ${error.status}, ${error.code}): ${error.message}.${correlation}`;
  if (kind === "network") return `${error.message} The outcome may be unknown; do not assume a state change.${correlation}`;
  return `API error (HTTP ${error.status ?? "unknown"}, ${error.code}): ${error.message}.${correlation}`;
}

function pageHeader(title: string, description: string): string {
  return `<header class="driver-page-heading"><p class="driver-kicker">RELAYOPS · DRIVER</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>`;
}

function label(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
}
