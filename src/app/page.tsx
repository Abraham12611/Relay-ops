const foundationEndpoints = [
  "POST /api/v1/incidents",
  "GET /api/v1/incidents",
  "GET /api/v1/incidents/:id",
  "GET /api/v1/incidents/:id/shipments",
  "GET /api/v1/shipments/:id",
  "GET /api/v1/vehicles/available",
  "POST /api/v1/recovery/simulate",
  "POST /api/v1/recovery/plans",
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/">RelayOps</a>
        <span className="environment-tag">Foundation</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Logistics exception recovery</p>
        <h1>Keep every delivery moving.</h1>
        <p className="lede">
          A durable incident and recovery API is ready for the driver, dispatcher, and agent workflows.
          Demo data resets to a clean pre-incident state; incident reports persist in SQLite.
        </p>
        <a className="primary-link" href="/api/v1/health">Check API health <span aria-hidden="true">→</span></a>
      </section>
      <section className="api-card" aria-labelledby="api-heading">
        <div>
          <p className="eyebrow">Version 1 API</p>
          <h2 id="api-heading">Foundation routes</h2>
        </div>
        <ul>
          {foundationEndpoints.map((endpoint) => <li key={endpoint}><code>{endpoint}</code></li>)}
        </ul>
      </section>
      <footer>All fixture records are synthetic. Demo persona changes are authenticated and verified on the server.</footer>
    </main>
  );
}
