"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./demo.css";

type DemoRole = "DISPATCHER" | "CUSTOMER";
type Message = { kind: "info" | "success" | "error"; text: string };

type ScenarioStatus = {
  state: string;
  incidentId: string | null;
  incidentCount: number;
  baselineShipmentCount: number;
  affectedShipmentCount: number;
  terminalShipmentCount: number;
  resetAvailable: boolean;
};

type HealthStatus = { status: string; database: string };
type ApiEnvelope<T> = { data: T; correlationId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The demo API returned an unreadable response. Refresh and try again.");
  }

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    throw new Error(typeof error.message === "string" ? error.message : `Request failed (${response.status}).`);
  }
  if (!isRecord(payload) || !isRecord(payload.data) || typeof payload.correlationId !== "string") {
    throw new Error("The demo API response could not be verified. Refresh and try again.");
  }
  return payload as ApiEnvelope<T>;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function startDemoSession(role: DemoRole): Promise<void> {
  const response = await fetch("/api/demo/session", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Request-ID": requestId(),
    },
    body: JSON.stringify({ role }),
  });
  const result = await readEnvelope<{ role: string; expiresInSeconds: number }>(response);
  if (result.data.role !== role || !Number.isSafeInteger(result.data.expiresInSeconds) || result.data.expiresInSeconds <= 0) {
    throw new Error("The selected demo persona was not confirmed. The current session was left unchanged.");
  }
}

export default function DemoLaunchpad({ initialActiveRole }: { initialActiveRole: DemoRole | null }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioStatus | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<DemoRole | null>(initialActiveRole);
  const [sessionMessage, setSessionMessage] = useState<Message>(() => initialActiveRole
    ? { kind: "success", text: `${initialActiveRole === "DISPATCHER" ? "Dispatcher" : "Customer"} demo session verified from the server-issued cookie for this browser profile.` }
    : { kind: "info", text: "Choose a demo-only customer or dispatcher persona. The server issues a signed, HttpOnly session cookie." });
  const [selectingRole, setSelectingRole] = useState<DemoRole | null>(null);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<Message | null>(null);

  const refreshLaunchpad = useCallback(async (): Promise<ScenarioStatus | null> => {
    setRefreshing(true);
    const [healthResult, scenarioResult] = await Promise.allSettled([
      fetch("/api/v1/health", { cache: "no-store" }).then(readEnvelope<HealthStatus>),
      fetch("/api/demo/state", { cache: "no-store", credentials: "same-origin" }).then(readEnvelope<ScenarioStatus>),
    ]);

    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value.data);
      setHealthError(null);
    } else {
      setHealth(null);
      setHealthError(healthResult.reason instanceof Error ? healthResult.reason.message : "Health check failed.");
    }

    let refreshedScenario: ScenarioStatus | null = null;
    if (scenarioResult.status === "fulfilled") {
      refreshedScenario = scenarioResult.value.data;
      setScenario(refreshedScenario);
      setScenarioError(null);
    } else {
      setScenario(null);
      setScenarioError(scenarioResult.reason instanceof Error ? scenarioResult.reason.message : "Scenario status could not be loaded.");
    }

    setLastChecked(new Date().toISOString());
    setRefreshing(false);
    return refreshedScenario;
  }, []);

  useEffect(() => {
    void refreshLaunchpad();
  }, [refreshLaunchpad]);

  async function choosePersona(role: DemoRole, destination?: string) {
    if (selectingRole) return;
    setSelectingRole(role);
    setSessionMessage({ kind: "info", text: `Validating the ${role.toLowerCase()} demo session…` });
    try {
      await startDemoSession(role);
      setActiveRole(role);
      setSessionMessage({
        kind: "success",
        text: `${role === "DISPATCHER" ? "Dispatcher" : "Customer"} demo session confirmed for this browser profile.`,
      });
      if (destination) window.location.assign(destination);
    } catch (error) {
      setSessionMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "The demo session could not be confirmed.",
      });
    } finally {
      setSelectingRole(null);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetting || resetPhrase.trim().toUpperCase() !== "RESET SCENARIO") return;
    setResetting(true);
    setResetMessage({ kind: "info", text: "Resetting the isolated demo scenario…" });
    try {
      await readEnvelope<{ state: string }>(await fetch("/api/demo/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-Request-ID": requestId() },
      }));
      const updated = await refreshLaunchpad();
      if (updated?.state === "PRE-INCIDENT" && updated.incidentCount === 0) {
        setResetMessage({ kind: "success", text: "Reset confirmed. Fresh PRE-INCIDENT state is loaded from the server." });
        setShowResetConfirmation(false);
        setResetPhrase("");
      } else {
        setResetMessage({ kind: "error", text: "The reset response succeeded, but the refreshed state is not PRE-INCIDENT. Verify the isolated demo database before continuing." });
      }
    } catch (error) {
      setResetMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Reset could not be confirmed. Refresh the scenario state before continuing.",
      });
    } finally {
      setResetting(false);
    }
  }

  const incidentActive = (scenario?.incidentCount ?? 0) > 0;
  const scenarioLabel = scenario?.state ?? (scenarioError ? "Status unavailable" : "Checking scenario…");
  const resetAvailable = scenario?.resetAvailable === true;

  return (
    <main className="demo-page">
      <div className="demo-shell">
        <header className="demo-header">
          <a className="demo-brand" href="/" aria-label="RelayOps home"><span className="demo-brand-mark">R</span><span>RelayOps</span></a>
          <div className="demo-header-meta"><span className="demo-data-pill"><span aria-hidden="true" /> Synthetic demo</span><a href="/">Home <span aria-hidden="true">↗</span></a></div>
        </header>

        <section className="demo-hero" aria-labelledby="demo-title">
          <div>
            <p className="demo-eyebrow">LIVE DEMO CONTROL DECK</p>
            <h1 id="demo-title">One scenario.<br />Every point of view.</h1>
            <p className="demo-lede">Launch the customer, driver, and dispatcher experiences for a synthetic shipment recovery. Check the service and scenario before you begin.</p>
          </div>
          <div className="demo-hero-aside"><span className="demo-aside-kicker">FEATURED SHIPMENT</span><strong>MED-2048</strong><span>Critical · TRK-2048</span><span className="demo-aside-rule" /><span>All names, routes, and events are fictional seed data.</span></div>
        </section>

        <section className="demo-status-grid" aria-label="Scenario and service status">
          <article className={`demo-status-card ${incidentActive ? "is-active" : "is-ready"}`}>
            <div className="demo-card-heading"><div><p className="demo-eyebrow">SCENARIO STATUS</p><h2>{scenarioLabel.replaceAll("_", " ")}</h2></div><span className="demo-status-dot" aria-hidden="true" /></div>
            <div className="demo-stat-row">
              <div><span>Incident</span><strong>{scenario?.incidentId ?? "Not started"}</strong></div>
              <div><span>{incidentActive ? "Linked shipments" : "Shipments ready"}</span><strong>{incidentActive ? scenario?.affectedShipmentCount ?? "—" : scenario?.baselineShipmentCount ?? "—"}</strong></div>
              <div><span>Terminal packages</span><strong>{incidentActive ? `${scenario?.terminalShipmentCount ?? 0} / ${scenario?.affectedShipmentCount ?? 0}` : "—"}</strong></div>
            </div>
            {scenarioError && <p className="demo-inline-error" role="alert">{scenarioError}</p>}
            <div className="demo-status-footer"><span>{lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString()}` : "Waiting for the first check"}</span><button className="demo-quiet-button" type="button" onClick={() => void refreshLaunchpad()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh status ↻"}</button></div>
          </article>

          <article className="demo-health-card">
            <div className="demo-card-heading"><div><p className="demo-eyebrow">SERVICE HEALTH</p><h2>{healthError ? "Health check failed" : health?.status === "ok" ? "Ready to rehearse" : "Checking service…"}</h2></div><span className={`demo-health-mark ${health?.status === "ok" ? "is-healthy" : healthError ? "is-error" : ""}`} aria-hidden="true">{health?.status === "ok" ? "✓" : healthError ? "!" : "·"}</span></div>
            <p className="demo-health-copy">{healthError ?? (health?.status === "ok" ? `API reachable · database ${health.database}` : "Checking the API and local database connection.")}</p>
            <div className="demo-truth-note"><span aria-hidden="true">i</span><p>Delivery of MED-2048 alone does not resolve the incident. It stays MONITORING until all six linked packages are terminal.</p></div>
          </article>
        </section>

        <section className="demo-persona-section" id="dispatcher" aria-labelledby="persona-heading">
          <div className="demo-section-heading"><div><p className="demo-eyebrow">DEMO PERSONA</p><h2 id="persona-heading">Choose a browser session</h2><p>The server validates each seeded role and sets a signed HttpOnly cookie. No browser key or manual cookie editing is used.</p></div><span className="demo-session-expiry">8-hour demo session</span></div>
          <div className="demo-persona-grid">
            <article className={`demo-persona-card ${activeRole === "DISPATCHER" ? "is-selected" : ""}`}>
              <div className="demo-persona-icon dispatcher-icon" aria-hidden="true">D</div><div className="demo-persona-copy"><span>01 · OPERATIONS</span><h3>Dispatcher</h3><p>Review the exception queue and incident command center.</p></div>
              <button className="demo-outline-button" type="button" onClick={() => void choosePersona("DISPATCHER")} disabled={selectingRole !== null}>{selectingRole === "DISPATCHER" ? "Starting session…" : activeRole === "DISPATCHER" ? "Dispatcher selected ✓" : "Use dispatcher session"}</button>
              <button className="demo-text-button" type="button" onClick={() => void choosePersona("DISPATCHER", "/ops")} disabled={selectingRole !== null}>Open operations dashboard <span aria-hidden="true">→</span></button>
            </article>
            <article className={`demo-persona-card ${activeRole === "CUSTOMER" ? "is-selected" : ""}`}>
              <div className="demo-persona-icon customer-icon" aria-hidden="true">C</div><div className="demo-persona-copy"><span>02 · SHIPMENT VIEW</span><h3>Customer</h3><p>See the customer-safe progress for the critical shipment.</p></div>
              <button className="demo-outline-button" type="button" onClick={() => void choosePersona("CUSTOMER")} disabled={selectingRole !== null}>{selectingRole === "CUSTOMER" ? "Starting session…" : activeRole === "CUSTOMER" ? "Customer selected ✓" : "Use customer session"}</button>
              <button className="demo-text-button" type="button" onClick={() => void choosePersona("CUSTOMER", "/track/TRK-2048")} disabled={selectingRole !== null}>Open customer tracking <span aria-hidden="true">→</span></button>
            </article>
          </div>
          <p className={`demo-session-message is-${sessionMessage.kind}`} role={sessionMessage.kind === "error" ? "alert" : "status"} aria-live="polite">{sessionMessage.text}</p>
          <p className="demo-profile-warning">A demo persona cookie is shared by every tab in this browser profile. For simultaneous roles, use separate browser profiles; the driver page keeps its own DRV-014 / DRV-009 picker.</p>
        </section>

        <section className="demo-experiences" id="experiences" aria-labelledby="experiences-heading">
          <div className="demo-section-heading"><div><p className="demo-eyebrow">EXPERIENCES</p><h2 id="experiences-heading">Go to a workspace</h2><p>Each view reads the same seeded scenario and persisted API state.</p></div></div>
          <div className="demo-experience-grid">
            <article className="demo-experience-card customer-experience"><span className="demo-experience-number">01</span><span className="demo-experience-tag">CUSTOMER</span><h3>Shipment tracking</h3><p>Customer-safe status and timeline for TRK-2048.</p><button type="button" onClick={() => void choosePersona("CUSTOMER", "/track/TRK-2048")} disabled={selectingRole !== null}>Open as customer <span aria-hidden="true">↗</span></button></article>
            <article className="demo-experience-card driver-experience"><span className="demo-experience-number">02</span><span className="demo-experience-tag">DRIVER</span><h3>Driver portal</h3><p>Choose the seeded primary or backup driver and inspect assigned jobs.</p><a href="/driver">Open driver portal <span aria-hidden="true">↗</span></a></article>
            <article className="demo-experience-card dispatcher-experience"><span className="demo-experience-number">03</span><span className="demo-experience-tag">DISPATCHER</span><h3>Operations dashboard</h3><p>Use the server-issued dispatcher session to open the existing dashboard.</p><button type="button" onClick={() => void choosePersona("DISPATCHER", "/ops")} disabled={selectingRole !== null}>Open as dispatcher <span aria-hidden="true">↗</span></button></article>
            <article className="demo-experience-card exception-experience"><span className="demo-experience-number">04</span><span className="demo-experience-tag">CASE WORKFLOW</span><h3>Exception queue</h3><p>Find INC-1042 and open its command center after the driver reports a breakdown.</p><button type="button" onClick={() => void choosePersona("DISPATCHER", "/ops/exceptions")} disabled={selectingRole !== null}>Open exception queue <span aria-hidden="true">↗</span></button></article>
          </div>
          <div className="demo-room-note"><span className="demo-room-mark" aria-hidden="true">↗</span><div><strong>Switch / Mattermost room</strong><p>No real room URL is verified in this environment, so the launchpad does not fabricate a link. Use the configured real room during the rehearsal.</p></div><span className="demo-room-state">Not linked</span></div>
        </section>

        <section className="demo-reset-section" aria-labelledby="reset-heading">
          <div><p className="demo-eyebrow">DEMO OPERATOR CONTROL</p><h2 id="reset-heading">Reset the scenario</h2><p>Restores the isolated local demo database to its fresh PRE-INCIDENT seed. The protected reset endpoint is called server-to-server; the operator key is never sent to the browser.</p>{!resetAvailable && <p className="demo-reset-caveat">Browser reset is disabled unless DEMO_MODE is configured on a non-production server. For an isolated local database, use <code>npm run reset:demo</code>.</p>}</div>
          <button className="demo-reset-button" type="button" onClick={() => { setResetMessage(null); setResetPhrase(""); setShowResetConfirmation(true); }} disabled={!resetAvailable || resetting}>{resetting ? "Resetting…" : "Reset scenario"}</button>
          {resetMessage && <p className={`demo-reset-message is-${resetMessage.kind}`} role={resetMessage.kind === "error" ? "alert" : "status"}>{resetMessage.text}</p>}
        </section>

        <footer className="demo-footer"><a href="/">RelayOps</a><span>Fictional demo data · No live GPS or production dispatch</span><a href="/track/TRK-2048">Customer view <span aria-hidden="true">↗</span></a></footer>
      </div>

      {showResetConfirmation && <div className="demo-modal-backdrop"><section className="demo-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description"><button className="demo-dialog-close" type="button" aria-label="Cancel reset" onClick={() => { setShowResetConfirmation(false); setResetPhrase(""); }} disabled={resetting}>×</button><p className="demo-eyebrow">CONFIRM SCENARIO RESET</p><h2 id="reset-dialog-title">Start from a clean seed?</h2><p id="reset-dialog-description">This replaces the current local demo scenario with PRE-INCIDENT state. Do not reset a shared or production database.</p><form onSubmit={confirmReset}><label htmlFor="reset-phrase">Type <strong>RESET SCENARIO</strong> to continue</label><input id="reset-phrase" value={resetPhrase} onChange={(event) => setResetPhrase(event.currentTarget.value)} autoComplete="off" autoFocus disabled={resetting} /><div className="demo-dialog-actions"><button className="demo-quiet-button" type="button" onClick={() => { setShowResetConfirmation(false); setResetPhrase(""); }} disabled={resetting}>Cancel</button><button className="demo-reset-button" type="submit" disabled={resetting || resetPhrase.trim().toUpperCase() !== "RESET SCENARIO"}>{resetting ? "Resetting…" : "Confirm reset"}</button></div></form></section></div>}
    </main>
  );
}
