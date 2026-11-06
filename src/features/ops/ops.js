import { createOpsApi, OpsApiError } from "./ops-api.js";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function unwrapData(payload) {
  return payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
}

export function getRoute(pathname) {
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) || "/" : pathname;
  if (path === "/ops" || path === "/ops/index.html") return { name: "overview" };
  if (path === "/ops/exceptions" || path === "/ops/exceptions/index.html") return { name: "exceptions" };
  if (path === "/ops/activity") return { name: "activity" };
  const caseMatch = path.match(/^\/ops\/exceptions\/([^/]+)$/);
  if (caseMatch) return { name: "case", id: decodeURIComponent(caseMatch[1]) };
  const shipmentMatch = path.match(/^\/ops\/shipments\/([^/]+)$/);
  if (shipmentMatch) return { name: "shipment", id: decodeURIComponent(shipmentMatch[1]) };
  return { name: "notFound" };
}

export function getCollection(payload, keys) {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

export function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return `${new Intl.DateTimeFormat("en", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(date)} UTC`;
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function statusTone(status) {
  const normalized = String(status ?? "UNKNOWN").toUpperCase();
  if (["CRITICAL", "FAILED", "EXECUTION_FAILED", "REJECTED", "BROKEN_DOWN", "ESCALATED"].includes(normalized)) return "danger";
  if (["HIGH", "OPEN", "INVESTIGATING", "AWAITING_APPROVAL", "PENDING", "AT_RISK", "PROPOSED", "EXECUTING"].includes(normalized)) return "warning";
  if (["APPROVED", "EXECUTED", "RESOLVED", "AVAILABLE", "DELIVERED", "COMPLETED", "CONSUMED"].includes(normalized)) return "success";
  return "neutral";
}

function badge(status, prefix = "") {
  const label = status ? String(status).replaceAll("_", " ") : "Unknown";
  return `<span class="status-badge ${statusTone(status)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(prefix)}${escapeHtml(label)}</span>`;
}

function incidentItems(payload) {
  return getCollection(payload, ["incidents", "cases", "items"]);
}

function eventItems(payload) {
  return getCollection(payload, ["events", "items"]);
}

function makeMetric(label, value, caption, tone = "") {
  return `<article class="metric-card ${tone}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><span>${escapeHtml(caption)}</span></article>`;
}

function emptyState(title, detail, action = "") {
  return `<section class="empty-state"><span class="empty-mark" aria-hidden="true">—</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${action}</section>`;
}

function eventActor(event) {
  const type = event?.actorType ?? "SYSTEM";
  const actor = event?.actorId && event.actorId !== type ? ` · ${event.actorId}` : "";
  return `${type}${actor}`;
}

function timeline(events, emptyCopy = "No backend events have been recorded for this case.") {
  if (!events?.length) return emptyState("No events recorded", emptyCopy);
  const ordered = [...events].sort((left, right) => new Date(left.createdAt ?? 0) - new Date(right.createdAt ?? 0));
  return `<ol class="timeline">${ordered.map((event) => `
    <li class="timeline-item">
      <span class="timeline-pin" aria-hidden="true"></span>
      <div class="timeline-content">
        <div class="timeline-heading"><strong>${escapeHtml(String(event.type ?? "Event").replaceAll("_", " "))}</strong><time>${escapeHtml(formatDate(event.createdAt))}</time></div>
        <p>${escapeHtml(eventActor(event))}${event.visibility ? ` · ${escapeHtml(event.visibility)}` : ""}</p>
        <div class="event-ids"><span>Event <code>${escapeHtml(event.id ?? "ID not returned")}</code></span><span>Correlation <code>${escapeHtml(event.correlationId ?? "Not returned")}</code></span></div>
      </div>
    </li>`).join("")}</ol>`;
}

function incidentCard(incident) {
  const id = incident.id ?? incident.caseId ?? "Unknown case";
  const count = incident.affectedShipmentCount ?? incident.shipmentCount ?? incident.affectedShipments?.length;
  return `<a class="exception-row" data-nav href="/ops/exceptions/${encodeURIComponent(id)}">
    <span class="severity-bar ${statusTone(incident.severity)}" aria-hidden="true"></span>
    <span class="exception-main"><span class="exception-id">${escapeHtml(id)}</span><span class="exception-summary">${escapeHtml(incident.summary ?? "No incident summary returned")}</span></span>
    <span class="exception-impact">${count == null ? "Impact not returned" : `${escapeHtml(count)} shipments`}</span>
    ${badge(incident.severity ?? "Unknown", "Severity · ")}
    ${badge(incident.status ?? "Unknown")}
    <span class="row-arrow" aria-hidden="true">→</span>
  </a>`;
}

function eventList(events, cases) {
  const caseById = new Map(cases.map((item) => [item.id, item]));
  if (!events.length) return emptyState("No activity yet", "Replay appears here when the API returns persisted case events.");
  return `<ol class="timeline replay-list">${events.map((event) => {
    const caseId = event.caseId ?? event.incidentId;
    const known = caseById.get(caseId);
    return `<li class="timeline-item"><span class="timeline-pin" aria-hidden="true"></span><div class="timeline-content">
      <div class="timeline-heading"><strong>${escapeHtml(String(event.type ?? "Event").replaceAll("_", " "))}</strong><time>${escapeHtml(formatDate(event.createdAt))}</time></div>
      <p>${escapeHtml(eventActor(event))} · ${escapeHtml(caseId ?? "Case ID not returned")}</p>
      <div class="event-ids"><span>Event <code>${escapeHtml(event.id ?? "ID not returned")}</code></span><span>Correlation <code>${escapeHtml(event.correlationId ?? "Not returned")}</code></span></div>
      ${caseId ? `<a class="text-link" data-nav href="/ops/exceptions/${encodeURIComponent(caseId)}">${known ? "Open case" : "Open referenced case"} <span aria-hidden="true">↗</span></a>` : ""}
    </div></li>`;
  }).join("")}</ol>`;
}

function shell(route, content, health, preview = false, menuOpen = false) {
  const active = route.name === "case" || route.name === "exceptions" ? "exceptions" : route.name;
  const healthLabel = health?.available === true ? "API connected" : health?.available === false ? "API unavailable" : "API status not verified";
  const healthClass = health?.available === true ? "connected" : health?.available === false ? "disconnected" : "unknown";
  return `<div class="app-shell">
    <aside id="ops-navigation" class="sidebar ${menuOpen ? "mobile-open" : ""}">
      <a class="brand" data-nav href="/ops" aria-label="RelayOps operations home"><span class="brand-mark">R</span><span><strong>RelayOps</strong><small>Operations</small></span></a>
      <div class="nav-label">WORKSPACE</div>
      <nav aria-label="Operations navigation">
        <a class="nav-item ${active === "overview" ? "active" : ""}" data-nav href="/ops"><span class="nav-icon">▦</span>Overview</a>
        <a class="nav-item ${active === "exceptions" ? "active" : ""}" data-nav href="/ops/exceptions"><span class="nav-icon">◇</span>Exceptions</a>
        <a class="nav-item ${active === "activity" ? "active" : ""}" data-nav href="/ops/activity"><span class="nav-icon">↻</span>Recovery Replay</a>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-note"><span class="note-icon">i</span><span>Decisions are recorded by the RelayOps API. Chat is collaboration, not approval authority.</span></div>
      <div class="user-chip"><span class="avatar">D</span><span><strong>Dispatcher workspace</strong><small>Identity enforced by API</small></span></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="mobile-brand"><button class="mobile-nav-toggle" type="button" data-action="toggle-menu" aria-label="Open operations navigation" aria-controls="ops-navigation" aria-expanded="${menuOpen}">≡</button><span class="brand-mark">R</span><strong>RelayOps</strong></div>
        <div class="crumb"><span>Operations</span><span class="crumb-sep">/</span><strong>${escapeHtml(route.name === "case" ? "Case command center" : route.name === "shipment" ? "Shipment detail" : route.name === "activity" ? "Recovery Replay" : route.name === "exceptions" ? "Exceptions" : "Overview")}</strong></div>
        <div class="topbar-actions"><span class="connection ${healthClass}"><span class="connection-dot"></span>${escapeHtml(healthLabel)}</span><button class="icon-button" type="button" data-action="refresh" aria-label="Refresh current page" title="Refresh">↻</button></div>
      </header>
      <div class="page-content">${preview ? `<div class="preview-banner" role="note"><strong>Synthetic fixture preview · read only</strong><span>Seed data is not live. No plan, agent reply, approval or chat link is fabricated.</span></div>` : ""}${content}</div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </main>
  </div>`;
}

function errorMessage(error) {
  if (!(error instanceof OpsApiError)) return { title: "Could not load operations data", text: error?.message ?? "An unexpected error occurred." };
  if (error.status === 401) return { title: "Sign-in required", text: "The API did not authenticate this request. Sign in through the application and try again." };
  if (error.status === 403) return { title: "Access denied", text: "Your current identity is not permitted to read this operations resource." };
  if (error.status === 503) return { title: "Service unavailable", text: error.message };
  if (error.status === 404) return { title: "Record not found", text: error.message };
  if (error.code === "NETWORK_ERROR") return { title: "API connection failed", text: "RelayOps could not reach the business API. Your page remains available when the service returns." };
  return { title: "Request failed", text: error.message };
}

function errorPanel(error) {
  const copy = errorMessage(error);
  const correlation = error?.correlationId ? `<p class="correlation">Correlation ID <code>${escapeHtml(error.correlationId)}</code></p>` : "";
  return `<section class="error-panel"><span class="error-symbol" aria-hidden="true">!</span><div><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.text)}</p>${correlation}<button class="button button-secondary" type="button" data-action="refresh">Try again</button></div></section>`;
}

function staleBanner(error, at) {
  const label = at ? `Last successful refresh ${escapeHtml(formatDate(at))}.` : "Previously loaded data is shown.";
  return `<div class="stale-banner" role="status"><strong>Showing stale data.</strong> ${label} Refresh failed: ${escapeHtml(error?.message ?? "API unavailable")}</div>`;
}

function overviewPage(incidents, health) {
  const active = incidents.filter((caseItem) => !["RESOLVED"].includes(caseItem.status)).length;
  const critical = incidents.filter((caseItem) => caseItem.severity === "CRITICAL").length;
  const awaiting = incidents.filter((caseItem) => caseItem.status === "AWAITING_APPROVAL").length;
  const affected = incidents.reduce((sum, caseItem) => sum + Number(caseItem.affectedShipmentCount ?? caseItem.shipmentCount ?? caseItem.affectedShipments?.length ?? 0), 0);
  const hasAffectedCount = incidents.some((caseItem) => caseItem.affectedShipmentCount != null || caseItem.shipmentCount != null || caseItem.affectedShipments?.length != null);
  return `<section class="page-heading"><div><p class="eyebrow">DISPATCH CONTROL</p><h1>Operations overview</h1><p>Current exception state, grounded in the RelayOps business API.</p></div><button class="button button-secondary" type="button" data-action="refresh"><span>↻</span> Refresh data</button></section>
    <section class="metrics-grid" aria-label="Operations indicators">
      ${makeMetric("Active exceptions", active, "Open cases returned by API", "metric-blue")}
      ${makeMetric("Critical cases", critical, "Severity reported by API", "metric-red")}
      ${makeMetric("Awaiting approval", awaiting, "Plans pending dispatcher decision", "metric-amber")}
      ${makeMetric("Affected shipments", hasAffectedCount ? affected : "—", hasAffectedCount ? "Count from incident records" : "Not included in list response", "metric-slate")}
    </section>
    <section class="content-card"><div class="section-heading"><div><p class="eyebrow">QUEUE SNAPSHOT</p><h2>Exceptions needing attention</h2></div><a class="text-link" data-nav href="/ops/exceptions">Open queue <span aria-hidden="true">→</span></a></div>
      ${incidents.length ? `<div class="exception-list">${incidents.slice(0, 6).map(incidentCard).join("")}</div>` : emptyState("Queue is clear", "No incidents were returned by the API.", `<a class="button button-secondary" data-nav href="/ops/exceptions">View exception queue</a>`)}
    </section>
    <section class="integration-callout"><span class="integration-mark">${health?.available === true ? "✓" : "!"}</span><div><strong>${health?.available === true ? "Business API reachable" : "Operational data is not verified"}</strong><p>${health?.available === true ? "Case details, approvals and Recovery Replay use persisted API records." : "KPI values stay empty or zero until incident data is returned. No local chat or approval simulation is active."}</p></div><span class="connection ${health?.available === true ? "connected" : "unknown"}">${escapeHtml(health?.label ?? "Health check pending")}</span></section>`;
}

function exceptionPage(incidents, filters = {}) {
  const filtered = filterIncidents(incidents, filters);
  const statusOptions = ["OPEN", "INVESTIGATING", "AWAITING_APPROVAL", "APPROVED", "EXECUTING", "MONITORING", "RESOLVED", "REJECTED", "FAILED", "ESCALATED"];
  const severityOptions = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const listContent = filtered.length
    ? filtered.map(incidentCard).join("")
    : incidents.length
      ? emptyState("No matching exceptions", "Adjust the search or filters to see more cases.")
      : emptyState("No exceptions found", "The API returned an empty exception queue.");
  return `<section class="page-heading"><div><p class="eyebrow">DISPATCH CONTROL</p><h1>Exception queue</h1><p>Investigate operational incidents and open their evidence-backed command center.</p></div><div class="heading-actions"><span class="result-count">${filtered.length} ${filtered.length === 1 ? "case" : "cases"}</span><button class="button button-secondary" type="button" data-action="refresh">↻ Refresh</button></div></section>
    <section class="content-card queue-card"><div class="queue-tools"><label class="search-box"><span aria-hidden="true">⌕</span><span class="sr-only">Search exceptions</span><input type="search" data-filter="search" value="${escapeHtml(filters.query ?? "")}" placeholder="Search case ID, summary…" autocomplete="off"></label>
      <label class="select-label"><span class="sr-only">Filter by status</span><select data-filter="status"><option value="" ${filters.status ? "" : "selected"}>All statuses</option>${statusOptions.map((value) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="select-label"><span class="sr-only">Filter by severity</span><select data-filter="severity"><option value="" ${filters.severity ? "" : "selected"}>All severities</option>${severityOptions.map((value) => `<option value="${value}" ${filters.severity === value ? "selected" : ""}>${value}</option>`).join("")}</select></label></div>
      <div class="queue-labels"><span>CASE / SUMMARY</span><span>IMPACT</span><span>SEVERITY</span><span>STATUS</span><span aria-hidden="true"></span></div>
      <div class="exception-list" id="exception-list">${listContent}</div>
    </section>`;
}

function safePlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  let feasibility = plan.feasibilitySnapshot ?? plan.feasibility;
  if (typeof feasibility === "string") {
    try { feasibility = JSON.parse(feasibility); } catch { feasibility = null; }
  }
  return feasibility ? { ...plan, feasibilitySnapshot: feasibility } : plan;
}

export function getExecutionReceipt(events = []) {
  const event = [...events]
    .filter((item) => item?.type === "REASSIGNMENT_EXECUTED")
    .sort((left, right) => new Date(left.createdAt ?? 0) - new Date(right.createdAt ?? 0))
    .at(-1);
  if (!event) return null;

  let payload = event.payload ?? {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = {}; }
  }
  return {
    eventId: payload.eventId ?? event.id ?? null,
    planId: payload.planId ?? null,
    planHash: payload.planHash ?? null,
    planVersion: payload.planVersion ?? null,
    approvalId: payload.approvalId ?? null,
    assignmentId: payload.assignmentId ?? null,
    shipmentId: payload.shipmentId ?? event.shipmentId ?? null,
    caseId: payload.caseId ?? event.caseId ?? event.incidentId ?? null,
    status: payload.resultingStatus ?? "EXECUTED",
    executedAt: payload.executedAt ?? event.createdAt ?? null,
    newEtaAt: payload.newEtaAt ?? null,
  };
}

export function canDecideRecoveryPlan(incident, plan) {
  if (!incident || !plan) return false;
  const feasibility = plan.feasibilitySnapshot ?? plan.feasibility;
  const isCurrent = !incident.currentPlanId || incident.currentPlanId === plan.id;
  return plan.status === "PROPOSED"
    && incident.status === "AWAITING_APPROVAL"
    && isCurrent
    && feasibility?.eligible === true
    && Boolean(plan.id && plan.hash)
    && Number.isInteger(plan.version)
    && plan.version > 0;
}

function planEvidence(plan) {
  const feasibility = plan?.feasibilitySnapshot ?? plan?.feasibility;
  if (!feasibility) return `<div class="evidence-unavailable">No feasibility snapshot was returned for this plan.</div>`;
  const conflicts = Array.isArray(feasibility.conflicts) ? feasibility.conflicts : [];
  return `<div class="evidence-grid"><div class="evidence-item ${feasibility.eligible ? "positive" : "negative"}"><span>${feasibility.eligible ? "✓" : "!"}</span><div><strong>${feasibility.eligible ? "Eligible" : "Not eligible"}</strong><small>Server feasibility result</small></div></div>
    <div class="evidence-item ${feasibility.capacityOk ? "positive" : "negative"}"><span>${feasibility.capacityOk ? "✓" : "!"}</span><div><strong>${feasibility.capacityOk ? "Capacity available" : "Capacity not confirmed"}</strong><small>Target vehicle check</small></div></div></div>
    ${conflicts.length ? `<ul class="conflict-list">${conflicts.map((conflict) => `<li><span aria-hidden="true">!</span>${escapeHtml(conflict)}</li>`).join("")}</ul>` : `<p class="no-conflicts"><span aria-hidden="true">✓</span> No conflicts returned by the feasibility check.</p>`}`;
}

function approvalPanel(plan, incident, actionReceipt, persistedApproval, approvalError) {
  if (!plan) return `<section class="plan-card"><div class="plan-head"><div><p class="eyebrow">RECOVERY PLAN</p><h2>Awaiting agent proposal</h2></div>${badge("NOT RECORDED")}</div><p class="plan-empty-copy">A recommendation appears here only after the agent writes a versioned recovery plan to the business API. Nothing has been fabricated or approved.</p><div class="plan-empty-foot">Open the verified team room when the case response provides its real Mattermost URL; otherwise the room link is not configured.</div></section>`;
  const feasibility = plan.feasibilitySnapshot ?? plan.feasibility;
  const actorType = plan.createdByType ?? plan.proposedBy?.type ?? plan.proposedBy?.actorType;
  const title = actorType === "AGENT" ? "AI recovery recommendation" : "Recovery recommendation";
  const isCurrent = !incident.currentPlanId || incident.currentPlanId === plan.id;
  const canDecide = canDecideRecoveryPlan(incident, plan);
  const pendingApproval = persistedApproval ?? incident.approval ?? incident.currentApproval ?? plan.approval;
  const hasReceipt = Boolean(actionReceipt);
  let stateMessage = "Approval is bound to this exact plan revision; execution remains a separate agent workflow.";
  if (!isCurrent) stateMessage = "This plan is not the current incident revision; refresh before making a decision.";
  else if (incident.status !== "AWAITING_APPROVAL") stateMessage = `Dispatcher decisions are unavailable while the incident is ${String(incident.status ?? "in an unknown state").replaceAll("_", " ")}.`;
  else if (plan.status !== "PROPOSED") stateMessage = `This plan is ${String(plan.status ?? "not in a proposed state").replaceAll("_", " ")}; only a current proposal can be reviewed.`;
  else if (feasibility?.eligible !== true) stateMessage = "The server has not marked this plan eligible. Resolve conflicts before approval.";
  const receipt = actionReceipt?.data ?? actionReceipt;
  const receiptId = receipt?.id ?? receipt?.approvalId ?? receipt?.eventId;
  return `<section class="plan-card"><div class="plan-head"><div><p class="eyebrow">VERSIONED RECOVERY</p><h2>${escapeHtml(title)}</h2></div>${badge(plan.status ?? "Unknown")}</div>
    <p class="recommendation">${escapeHtml(plan.rationale ?? "The API returned no recovery rationale.")}</p>
    <div class="plan-targets"><div><span>Target vehicle</span><strong>${escapeHtml(plan.proposedVehicleId ?? "Not returned")}</strong></div><div><span>Target driver</span><strong>${escapeHtml(plan.proposedDriverId ?? "Not returned")}</strong></div><div><span>Revised ETA</span><strong>${escapeHtml(formatDate(plan.newEtaAt))}</strong></div><div><span>Plan revision</span><strong>v${escapeHtml(plan.version ?? "?")}</strong></div></div>
    <div class="evidence-title"><h3>Feasibility evidence</h3><span>API snapshot</span></div>${planEvidence(plan)}
    <div class="plan-identity"><div><span>Plan ID</span><code>${escapeHtml(plan.id ?? "Not returned")}</code></div><div><span>Bound hash</span><code>${escapeHtml(plan.hash ?? "Not returned")}</code></div></div>
    ${approvalError ? `<div class="inline-warning">Persisted approval status could not be refreshed: ${escapeHtml(approvalError.message)}</div>` : ""}
    ${pendingApproval?.status ? `<div class="approval-state ${statusTone(pendingApproval.status)}"><strong>Approval ${escapeHtml(String(pendingApproval.status).replaceAll("_", " "))}</strong><span>${pendingApproval.approvedBy ? `By ${escapeHtml(pendingApproval.approvedBy)}` : "Decision actor not returned"}${pendingApproval.approvedAt ? ` · ${escapeHtml(formatDate(pendingApproval.approvedAt))}` : ""}</span></div>` : ""}
    ${hasReceipt ? `<div class="action-receipt"><span class="receipt-icon">✓</span><div><strong>${escapeHtml(receipt?.status ?? "Decision recorded")}</strong><p>Case ${escapeHtml(incident.id)} · exact plan v${escapeHtml(plan.version ?? "?")}${receiptId ? ` · Receipt <code>${escapeHtml(receiptId)}</code>` : ""}</p></div></div>` : ""}
    <p class="approval-note">${escapeHtml(stateMessage)}</p>
    <div class="approval-actions"><button class="button button-primary" type="button" data-action="approve" data-plan-id="${escapeHtml(plan.id)}" ${canDecide ? "" : "disabled"}>Approve this version</button><button class="button button-reject" type="button" data-action="reject" data-plan-id="${escapeHtml(plan.id)}" ${canDecide ? "" : "disabled"}>Reject</button></div>
  </section>`;
}

function executionReceiptPanel(receipt) {
  if (!receipt) return "";
  const shipmentLink = receipt.shipmentId
    ? `<a class="text-link" data-nav href="/ops/shipments/${encodeURIComponent(receipt.shipmentId)}">Open persisted shipment record <span aria-hidden="true">→</span></a>`
    : "";
  return `<section class="content-card"><div class="section-heading"><div><p class="eyebrow">PERSISTED EXECUTION</p><h2>Recovery execution receipt</h2></div>${badge(receipt.status)}</div>
    <p class="section-subtitle">Execution details below come from the persisted REASSIGNMENT_EXECUTED audit event.</p>
    <div class="event-ids"><span>Assignment <code>${escapeHtml(receipt.assignmentId ?? "Not returned")}</code></span><span>Shipment <code>${escapeHtml(receipt.shipmentId ?? "Not returned")}</code></span><span>Event <code>${escapeHtml(receipt.eventId ?? "Not returned")}</code></span></div>
    ${receipt.newEtaAt ? `<p>Updated ETA · ${escapeHtml(formatDate(receipt.newEtaAt))}</p>` : ""}${shipmentLink}</section>`;
}

function affectedTable(shipments, incidentId, relationError) {
  if (!shipments?.length) return `<div class="shipment-empty">${escapeHtml(relationError ?? "No affected shipment details were included in the incident response.")}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>SHIPMENT</th><th>PRIORITY</th><th>STATUS</th><th>PROMISED ETA</th><th>LATEST ETA</th><th></th></tr></thead><tbody>${shipments.map((shipment) => `<tr><td><a class="shipment-link" data-nav href="/ops/shipments/${encodeURIComponent(shipment.id)}">${escapeHtml(shipment.id ?? "Unknown")}</a><small>${escapeHtml(shipment.trackingCode ?? "Tracking code unavailable")}</small></td><td>${badge(shipment.priority ?? "Unknown")}</td><td>${escapeHtml(String(shipment.status ?? "Unknown").replaceAll("_", " "))}</td><td>${escapeHtml(formatDate(shipment.promisedAt))}</td><td>${escapeHtml(formatDate(shipment.etaAt))}</td><td><a class="table-arrow" data-nav href="/ops/shipments/${encodeURIComponent(shipment.id)}" aria-label="Open shipment ${escapeHtml(shipment.id)}">↗</a></td></tr>`).join("")}</tbody></table></div>`;
}

function casePage(snapshot, extra = {}) {
  const { incident, shipments = [], events = [], vehicle, driver, plan, roomUrl, shipmentError, eventsError } = snapshot;
  const persistedExecution = getExecutionReceipt(events);
  const actualRoomUrl = safeUrl(roomUrl ?? snapshot.mattermostRoomUrl ?? snapshot.switch?.roomUrl ?? snapshot.chat?.url);
  const chatControl = actualRoomUrl
    ? `<a class="button button-secondary" href="${escapeHtml(actualRoomUrl)}" target="_blank" rel="noopener noreferrer">Open Mattermost room <span aria-hidden="true">↗</span></a>`
    : `<span class="room-unavailable" title="No verified Mattermost URL was returned by the API">Mattermost room link unavailable</span>`;
  const summary = incident.summary ?? "Incident summary not returned by API.";
  const currentEta = shipments.find((shipment) => shipment.priority === "CRITICAL")?.etaAt ?? plan?.newEtaAt;
  const promisedEta = shipments.find((shipment) => shipment.priority === "CRITICAL")?.promisedAt;
  const capture = extra.stale ? staleBanner(extra.error, extra.at) : "";
  const eventWarning = eventsError ? `<div class="inline-warning">The case loaded, but its event feed could not be read: ${escapeHtml(eventsError.message)}</div>` : "";
  return `${capture}<section class="page-heading case-heading"><div><a class="back-link" data-nav href="/ops/exceptions">← Exception queue</a><div class="case-title-line"><p class="eyebrow">CASE COMMAND CENTER</p>${badge(incident.severity ?? "Unknown", "Severity · ")}</div><h1>${escapeHtml(incident.id ?? "Case detail")}</h1><p>${escapeHtml(summary)}</p></div><div class="heading-actions">${badge(incident.status ?? "Unknown")}<button class="button button-secondary" type="button" data-action="refresh">↻ Refresh</button></div></section>
    <section class="case-stat-grid" aria-label="Case overview">
      <article><span>CASE TYPE</span><strong>${escapeHtml(String(incident.type ?? "Not returned").replaceAll("_", " "))}</strong></article>
      <article><span>IMPACTED SHIPMENTS</span><strong>${shipments.length || escapeHtml(incident.affectedShipmentCount ?? "Not returned")}</strong></article>
      <article><span>PROMISED ETA</span><strong>${escapeHtml(formatDate(promisedEta))}</strong></article>
      <article><span>LATEST ETA</span><strong>${escapeHtml(formatDate(currentEta))}</strong></article>
    </section>
    <div class="case-grid"><div class="case-main-column">
      <section class="content-card"><div class="section-heading"><div><p class="eyebrow">INCIDENT CONTEXT</p><h2>Operational facts</h2></div>${badge(incident.type ?? "Incident")}</div>
        <div class="fact-grid"><div class="fact"><span>Reported vehicle</span><strong>${escapeHtml(vehicle?.code ?? incident.vehicleId ?? "Not returned")}</strong><small>${escapeHtml(vehicle?.status ?? "Status not returned")}</small></div><div class="fact"><span>Reporter</span><strong>${escapeHtml(driver?.id ?? incident.reporterId ?? "Not returned")}</strong><small>${escapeHtml(driver?.dutyStatus ?? "Driver context not returned")}</small></div><div class="fact"><span>Created</span><strong>${escapeHtml(formatDate(incident.createdAt))}</strong><small>Source: business API</small></div><div class="fact"><span>Updated / resolved</span><strong>${escapeHtml(formatDate(incident.resolvedAt))}</strong><small>${incident.resolvedAt ? "Resolution timestamp" : "No resolution recorded"}</small></div></div>
      </section>
      <section class="content-card shipment-card"><div class="section-heading"><div><p class="eyebrow">CUSTOMER IMPACT</p><h2>Affected shipments</h2></div><span class="subtle-count">${shipments.length} listed</span></div>${shipmentError ? `<div class="inline-warning">${escapeHtml(shipmentError)}</div>` : ""}${affectedTable(shipments, incident.id, shipmentError)}</section>
      ${executionReceiptPanel(persistedExecution)}
      <section class="content-card replay-card"><div class="section-heading"><div><p class="eyebrow">RECOVERY REPLAY</p><h2>Immutable case timeline</h2><p class="section-subtitle">Rendered from persisted API events, in chronological order.</p></div><span class="source-pill">EVENT SOURCE</span></div>${eventWarning}${timeline(events)}</section>
    </div><aside class="case-side-column">${approvalPanel(plan, incident, extra.receipt, snapshot.approval, snapshot.approvalError)}
      <section class="content-card vehicle-context"><div class="section-heading"><div><p class="eyebrow">FLEET CONTEXT</p><h2>Vehicle & driver</h2></div></div><div class="vehicle-pair"><div class="vehicle-symbol" aria-hidden="true">V</div><div><strong>${escapeHtml(vehicle?.code ?? incident.vehicleId ?? "Vehicle not returned")}</strong><span>${escapeHtml(vehicle?.status ?? "Status unavailable")}</span></div></div><div class="capacity-line"><span>Capacity</span><strong>${vehicle?.occupiedUnits == null || vehicle?.capacityUnits == null ? "Not returned" : `${escapeHtml(vehicle.occupiedUnits)} / ${escapeHtml(vehicle.capacityUnits)} units`}</strong></div><div class="vehicle-pair driver-pair"><div class="avatar small">D</div><div><strong>${escapeHtml(driver?.id ?? "Driver context unavailable")}</strong><span>${escapeHtml(driver?.dutyStatus ?? "Duty status not returned")}</span></div></div>${chatControl}</section>
    </aside></div>`;
}

function shipmentPage(snapshot, extra = {}) {
  const shipment = snapshot.shipment;
  const events = snapshot.events ?? [];
  const incidentId = shipment.incidentId ?? shipment.caseId ?? snapshot.incidentId;
  const incidentLink = incidentId ? `<a class="text-link" data-nav href="/ops/exceptions/${encodeURIComponent(incidentId)}">Open related case ${escapeHtml(incidentId)} <span aria-hidden="true">→</span></a>` : `<span class="room-unavailable">No related case ID returned by API</span>`;
  return `${extra.stale ? staleBanner(extra.error, extra.at) : ""}<section class="page-heading"><div><a class="back-link" data-nav href="/ops/exceptions">← Exception queue</a><p class="eyebrow">INTERNAL SHIPMENT RECORD</p><h1>${escapeHtml(shipment.id ?? "Shipment detail")}</h1><p>Tracking reference ${escapeHtml(shipment.trackingCode ?? "not returned")}</p></div><div class="heading-actions">${badge(shipment.status ?? "Unknown")}<button class="button button-secondary" type="button" data-action="refresh">↻ Refresh</button></div></section>
    <section class="shipment-summary content-card"><div><span>PRIORITY</span>${badge(shipment.priority ?? "Unknown")}</div><div><span>ASSIGNED VEHICLE</span><strong>${escapeHtml(shipment.assignedVehicleId ?? "Not returned")}</strong></div><div><span>ASSIGNED DRIVER</span><strong>${escapeHtml(shipment.assignedDriverId ?? "Not returned")}</strong></div><div><span>UNITS</span><strong>${escapeHtml(shipment.units ?? "Not returned")}</strong></div></section>
    <div class="shipment-detail-grid"><section class="content-card"><div class="section-heading"><div><p class="eyebrow">DELIVERY COMMITMENT</p><h2>ETA & recovery updates</h2></div></div><div class="eta-grid"><div><span>Promised ETA</span><strong>${escapeHtml(formatDate(shipment.promisedAt))}</strong></div><div><span>Current ETA</span><strong>${escapeHtml(formatDate(shipment.etaAt))}</strong></div></div><div class="proof-row"><span>Proof of delivery</span><code>${escapeHtml(shipment.proofOfDeliveryRef ?? "No delivery proof recorded")}</code></div><div class="related-case">${incidentLink}</div></section>
      <section class="content-card"><div class="section-heading"><div><p class="eyebrow">SOURCE EVENTS</p><h2>Shipment history</h2></div><span class="source-pill">API RECORDS</span></div>${snapshot.eventsError ? `<div class="inline-warning">${escapeHtml(snapshot.eventsError.message)}</div>` : ""}${timeline(events, "No shipment history was included in the API response.")}</section></div>`;
}

function activityPage(incidents, events) {
  return `<section class="page-heading"><div><p class="eyebrow">APPEND-ONLY AUDIT</p><h1>Recovery Replay</h1><p>Follow incident, plan, approval and execution events returned by the business API.</p></div><button class="button button-secondary" type="button" data-action="refresh">↻ Refresh events</button></section>
    <section class="replay-summary"><div><strong>${events.length}</strong><span>events loaded</span></div><div><strong>${incidents.length}</strong><span>cases queried</span></div><p>No transcript is generated locally. Missing or delayed events remain missing until the API records them.</p></section>
    <section class="content-card replay-card"><div class="section-heading"><div><p class="eyebrow">REAL BACKEND EVENTS</p><h2>Across active cases</h2></div><span class="source-pill">PERSISTED EVENTS</span></div>${eventList(events, incidents)}</section>`;
}

export function filterIncidents(incidents, { query = "", status = "", severity = "" } = {}) {
  const needle = query.trim().toLowerCase();
  return incidents.filter((item) => {
    const matchesText = !needle || [item.id, item.summary, item.vehicleId, item.type].some((value) => String(value ?? "").toLowerCase().includes(needle));
    return matchesText && (!status || item.status === status) && (!severity || item.severity === severity);
  });
}

export function normalizeCaseResponse(payload) {
  const raw = unwrapData(payload) ?? {};
  const incident = raw.incident ?? raw.case ?? raw;
  const relationRows = raw.incidentShipments ?? raw.affectedShipments ?? raw.shipments ?? incident.affectedShipments ?? [];
  const initialShipments = Array.isArray(relationRows) ? relationRows.map((row) => row.shipment ?? row).filter((row) => row && typeof row === "object" && row.id) : [];
  const shipmentIds = Array.isArray(relationRows) ? relationRows.map((row) => row.shipmentId ?? row.id).filter(Boolean) : [];
  const linkedPlan = raw.currentPlan ?? raw.recoveryPlan ?? raw.plan
    ?? raw.recoveryPlans?.find((plan) => plan.id === incident.currentPlanId)
    ?? raw.plans?.find((plan) => plan.id === incident.currentPlanId)
    ?? null;
  return {
    incident,
    shipments: initialShipments,
    shipmentIds: [...new Set(shipmentIds)],
    vehicle: raw.vehicle ?? raw.involvedVehicle ?? incident.vehicle ?? null,
    driver: raw.driver ?? raw.reporter ?? incident.driver ?? null,
    plan: safePlan(linkedPlan),
    approval: linkedPlan?.approval ?? raw.approval ?? raw.currentApproval ?? null,
    roomUrl: raw.mattermostRoomUrl ?? raw.switch?.roomUrl ?? raw.chat?.url ?? null,
  };
}

function approvalFrom(payload) {
  const value = unwrapData(payload);
  if (!value || typeof value !== "object") return null;
  if (Object.hasOwn(value, "approval")) return value.approval;
  if (Object.hasOwn(value, "currentApproval")) return value.currentApproval;
  return value;
}

function receiptFrom(payload) {
  const data = unwrapData(payload);
  return data && typeof data === "object" ? data : { status: "Decision recorded" };
}

function renderSkeleton() {
  return `<div class="skeleton-heading"><span></span><span></span></div><div class="skeleton-metrics">${Array.from({ length: 4 }, () => `<div class="skeleton-card"><span></span><span></span><span></span></div>`).join("")}</div><div class="skeleton-card skeleton-wide"><span></span><span></span><span></span><span></span></div>`;
}

export function mountOpsApp(root, { api, windowRef = window } = {}) {
  if (!root) throw new TypeError("A root element is required to mount the ops feature.");
  const previewMode = new URLSearchParams(windowRef.location.search).get("preview") === "fixture";
  api ??= createOpsApi({ basePath: previewMode ? "/__preview-api/v1" : "/api/v1" });
  const cache = new Map();
  const receipts = new Map();
  const filters = { query: "", status: "", severity: "" };
  const state = { health: null, loading: false, menuOpen: false, preview: previewMode, route: getRoute(windowRef.location.pathname) };
  let requestSequence = 0;
  const listenerController = new AbortController();

  function toast(message) {
    const element = root.querySelector("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("visible");
    windowRef.setTimeout(() => element.classList.remove("visible"), 4200);
  }

  function render(content) {
    root.innerHTML = shell(state.route, content, state.health, state.preview, state.menuOpen);
  }

  async function refreshHealth() {
    try {
      const payload = unwrapData(await api.getHealth());
      state.health = { available: payload?.status === "healthy" || payload?.healthy === true || payload?.database?.healthy === true, label: payload?.status ?? payload?.database?.status ?? "Health response received" };
    } catch {
      state.health = { available: false, label: "Health check failed" };
    }
  }

  async function loadOverview() {
    const [incidentsResult, healthResult] = await Promise.allSettled([api.listIncidents(), api.getHealth()]);
    if (healthResult.status === "fulfilled") {
      const health = unwrapData(healthResult.value);
      state.health = { available: health?.status === "healthy" || health?.healthy === true || health?.database?.healthy === true, label: health?.status ?? health?.database?.status ?? "Health response received" };
    } else state.health = { available: false, label: "Health check failed" };
    if (incidentsResult.status === "rejected") throw incidentsResult.reason;
    return incidentItems(incidentsResult.value);
  }

  async function loadCase(caseId) {
    const detail = normalizeCaseResponse(await api.getIncident(caseId));
    const [eventsResult, affectedResult, approvalResult] = await Promise.all([
      api.getEvents(caseId).then((value) => ({ value }), (error) => ({ error })),
      api.getIncidentShipments(caseId).then((value) => ({ value }), (error) => ({ error })),
      detail.plan?.id
        ? api.getApproval(detail.plan.id).then((value) => ({ value }), (error) => ({ error }))
        : Promise.resolve({ value: null }),
    ]);
    const affectedShipments = affectedResult.error
      ? []
      : getCollection(affectedResult.value, ["shipments", "incidentShipments", "items"]);
    let shipments = affectedShipments.length ? affectedShipments : detail.shipments;
    if (!shipments.length && detail.shipmentIds.length) {
      const shipmentResults = await Promise.all(detail.shipmentIds.map((id) =>
        api.getShipment(id).then((value) => unwrapData(value)?.shipment ?? unwrapData(value), () => null)));
      shipments = shipmentResults.filter(Boolean);
    }
    const approvalError = approvalResult.error?.code === "APPROVAL_NOT_FOUND" ? null : approvalResult.error ?? null;
    return {
      ...detail,
      shipments,
      approval: approvalResult.error ? detail.approval : approvalFrom(approvalResult.value) ?? detail.approval,
      approvalError,
      events: eventsResult.error ? [] : eventItems(eventsResult.value),
      eventsError: eventsResult.error ?? null,
      shipmentError: affectedResult.error
        ? `Affected shipments could not be refreshed: ${affectedResult.error.message}`
        : detail.shipmentIds.length && shipments.length === 0
          ? "Affected shipment references were returned, but shipment details could not be loaded."
          : null,
    };
  }

  async function loadShipment(shipmentId) {
    const raw = unwrapData(await api.getShipment(shipmentId)) ?? {};
    const shipment = raw.shipment ?? raw;
    let events = Array.isArray(raw.events) ? raw.events : Array.isArray(shipment.events) ? shipment.events : [];
    let eventsError = null;
    const incidentId = shipment.incidentId ?? shipment.caseId ?? raw.incidentId;
    if (!events.length && incidentId) {
      try { events = eventItems(await api.getEvents(incidentId)); }
      catch (error) { eventsError = error; }
    }
    return { shipment, events, eventsError, incidentId };
  }

  async function loadActivity() {
    const incidents = incidentItems(await api.listIncidents());
    const eventResults = await Promise.all(incidents.map((item) => api.getEvents(item.id).then(eventItems, () => [])));
    const events = eventResults.flat().sort((left, right) => new Date(right.createdAt ?? 0) - new Date(left.createdAt ?? 0));
    return { incidents, events };
  }

  function cacheKey(route) {
    return `${route.name}:${route.id ?? ""}`;
  }

  function pageFor(route, data, extra = {}) {
    if (route.name === "overview") return overviewPage(data, state.health);
    if (route.name === "exceptions") return exceptionPage(data, filters);
    if (route.name === "case") return casePage(data, { ...extra, receipt: receipts.get(route.id) });
    if (route.name === "shipment") return shipmentPage(data, extra);
    if (route.name === "activity") return activityPage(data.incidents, data.events);
    return emptyState("Page not found", "This route is outside the operations command center.", `<a class="button button-secondary" data-nav href="/ops">Back to overview</a>`);
  }

  async function loadCurrent({ force = false } = {}) {
    const route = getRoute(windowRef.location.pathname);
    state.route = route;
    const sequence = ++requestSequence;
    if (route.name === "notFound") {
      render(pageFor(route));
      return;
    }
    const key = cacheKey(route);
    const cached = cache.get(key);
    render(`<div class="loading-state" role="status"><span class="spinner"></span><div><strong>Loading operations data</strong><p>Reading the current state from the RelayOps API.</p></div></div>${renderSkeleton()}`);
    state.loading = true;
    try {
      if (state.health === null) await refreshHealth();
      const data = route.name === "overview" ? await loadOverview()
        : route.name === "exceptions" ? incidentItems(await api.listIncidents())
        : route.name === "case" ? await loadCase(route.id)
        : route.name === "shipment" ? await loadShipment(route.id)
        : await loadActivity();
      if (sequence !== requestSequence) return;
      cache.set(key, { data, at: new Date().toISOString() });
      render(pageFor(route, data));
    } catch (error) {
      if (sequence !== requestSequence) return;
      if (cached) {
        render(pageFor(route, cached.data, { stale: true, error, at: cached.at }));
      } else {
        await refreshHealth();
        if (sequence !== requestSequence) return;
        render(errorPanel(error));
      }
    } finally {
      if (sequence === requestSequence) state.loading = false;
    }
  }

  root.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const nav = target.closest("a[data-nav]");
    if (nav && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      state.menuOpen = false;
      const destination = new URL(nav.href, windowRef.location.origin);
      if (state.preview) destination.searchParams.set("preview", "fixture");
      windowRef.history.pushState({}, "", destination);
      await loadCurrent();
      return;
    }
    const action = target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "toggle-menu") {
      state.menuOpen = !state.menuOpen;
      const sidebar = root.querySelector("#ops-navigation");
      sidebar?.classList.toggle("mobile-open", state.menuOpen);
      action.setAttribute("aria-expanded", String(state.menuOpen));
      action.setAttribute("aria-label", state.menuOpen ? "Close operations navigation" : "Open operations navigation");
      return;
    }
    if (action.dataset.action === "refresh") {
      await loadCurrent({ force: true });
      return;
    }
    if (action.dataset.action !== "approve" && action.dataset.action !== "reject") return;
    const snapshot = cache.get(cacheKey(state.route))?.data;
    const plan = snapshot?.plan;
    const incident = snapshot?.incident;
    if (!plan || !incident || action.disabled) return;
    const decision = action.dataset.action === "approve" ? "APPROVE" : "REJECT";
    const targetSummary = `${plan.proposedVehicleId ?? "target vehicle not returned"} / ${plan.proposedDriverId ?? "target driver not returned"}`;
    const exactScope = `Case ${incident.id}, plan ${plan.id}, version ${plan.version}, hash ${plan.hash}, recovery target ${targetSummary}.`;
    if (!windowRef.confirm(`${decision === "APPROVE" ? "Approve" : "Reject"} this exact recovery plan?\n\n${exactScope}\n\nThe protected RelayOps API will record the dispatcher decision. This does not execute the reassignment.`)) return;
    let reason;
    if (decision === "REJECT") {
      reason = windowRef.prompt("Reason for rejecting this recovery plan:")?.trim();
      if (!reason) {
        toast(`Case ${incident.id}: rejection not sent; a reason is required.`);
        return;
      }
    }
    action.disabled = true;
    action.setAttribute("aria-busy", "true");
    action.textContent = decision === "APPROVE" ? "Recording approval…" : "Recording rejection…";
    try {
      const result = await api.decideRecoveryPlan({
        planId: plan.id,
        planHash: plan.hash,
        planVersion: plan.version,
        decision,
        ...(reason ? { reason } : {}),
      });
      const receipt = receiptFrom(result);
      receipts.set(incident.id, receipt);
      toast(`Case ${incident.id}: ${decision.toLowerCase()} recorded by the API.`);
      await loadCurrent({ force: true });
    } catch (error) {
      action.disabled = false;
      action.removeAttribute("aria-busy");
      action.textContent = decision === "APPROVE" ? "Approve this version" : "Reject";
      if (error?.status === 409) {
        toast(`Case ${incident.id}: the plan or decision state changed. Refreshing current records.`);
        cache.delete(cacheKey(state.route));
        await loadCurrent({ force: true });
      } else {
        const correlation = error?.correlationId ? ` Correlation ID ${error.correlationId}.` : "";
        toast(`Case ${incident.id}: decision failed — ${error?.message ?? "request error"}.${correlation}`);
      }
    }
  }, { signal: listenerController.signal });

  root.addEventListener("input", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement) || control.dataset.filter !== "search") return;
    filters.query = control.value;
    updateFilteredQueue();
  }, { signal: listenerController.signal });
  root.addEventListener("change", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement) || !control.dataset.filter) return;
    filters[control.dataset.filter] = control.value;
    updateFilteredQueue();
  }, { signal: listenerController.signal });

  function updateFilteredQueue() {
    const list = root.querySelector("#exception-list");
    if (!list) return;
    const incidents = cache.get("exceptions:")?.data ?? [];
    const result = filterIncidents(incidents, filters);
    list.innerHTML = result.length ? result.map(incidentCard).join("") : emptyState("No matching exceptions", "Adjust the search or filters to see more cases.");
    const count = root.querySelector(".result-count");
    if (count) count.textContent = `${result.length} ${result.length === 1 ? "case" : "cases"}`;
  }

  const onPopState = () => { void loadCurrent(); };
  windowRef.addEventListener("popstate", onPopState, { signal: listenerController.signal });
  void loadCurrent();
  return Object.freeze({ refresh: () => loadCurrent({ force: true }), destroy: () => listenerController.abort() });
}

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root && root.dataset.opsMount !== "manual") mountOpsApp(root);
}
