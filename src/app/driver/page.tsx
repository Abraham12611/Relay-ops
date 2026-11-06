"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { mountDriverJobs } from "../../features/driver/views.ts";
import {
  DemoDriverSessionError,
  selectDemoDriverSession,
  type DemoDriverId,
} from "../../features/driver/demo-session.ts";
import "../../features/driver/driver.css";

export default function DriverPage() {
  const root = useRef<HTMLDivElement | null>(null);
  const [driverId, setDriverId] = useState<DemoDriverId>("DRV-014");
  const [mountVersion, setMountVersion] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("Select a seeded driver account to start or switch the signed session.");
  const [sessionMessageKind, setSessionMessageKind] = useState<"info" | "success" | "error">("info");

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const mounted = mountDriverJobs(container);
    return () => mounted.unmount();
  }, [mountVersion]);

  async function switchDriverSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (switching) return;
    setSwitching(true);
    setSessionMessage("Validating the selected demo driver session…");
    setSessionMessageKind("info");
    try {
      const result = await selectDemoDriverSession(driverId);
      setSessionMessage(`Session selected for ${result.driverId}; reloading its assignments from the authenticated API.`);
      setSessionMessageKind("success");
      setMountVersion((version) => version + 1);
    } catch (error) {
      setSessionMessage(error instanceof DemoDriverSessionError
        ? error.message
        : "The demo driver session could not be verified. Refresh and confirm the assignment before acting.");
      setSessionMessageKind("error");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <section className="driver-session-switcher" aria-labelledby="driver-session-heading">
        <div className="driver-session-switcher__copy">
          <p className="driver-session-switcher__eyebrow">Demo driver session</p>
          <h1 id="driver-session-heading">Choose a driver account</h1>
          <p>The server validates the seeded driver and issues a signed, HTTP-only session.</p>
        </div>
        <form className="driver-session-switcher__form" onSubmit={switchDriverSession}>
          <label htmlFor="demo-driver-id">Driver</label>
          <select
            id="demo-driver-id"
            value={driverId}
            onChange={(event) => setDriverId(event.currentTarget.value as DemoDriverId)}
            disabled={switching}
          >
            <option value="DRV-014">Primary driver · DRV-014</option>
            <option value="DRV-009">Backup driver · DRV-009</option>
          </select>
          <button type="submit" disabled={switching}>
            {switching ? "Switching…" : "Use this driver"}
          </button>
        </form>
        <p className={`driver-session-switcher__message is-${sessionMessageKind}`} role={sessionMessageKind === "error" ? "alert" : "status"} aria-live="polite">
          {sessionMessage}
        </p>
      </section>
      <div ref={root} />
    </>
  );
}
