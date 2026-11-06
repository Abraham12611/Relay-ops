export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/">RelayOps</a>
        <nav className="home-nav" aria-label="Demo experiences">
          <a href="/demo">Demo</a>
          <a href="/track/TRK-2048">Customer</a>
          <a href="/driver">Driver</a>
          <a href="/demo#dispatcher">Operations</a>
        </nav>
        <span className="environment-tag">Synthetic demo</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Logistics exception recovery</p>
        <h1>Keep every delivery moving.</h1>
        <p className="lede">
          Follow one synthetic shipment recovery from the customer view to the driver portal and dispatcher workspace. The demo launchpad checks service health and helps you open each experience with the right demo persona.
        </p>
        <a className="primary-link" href="/demo">Open the demo launchpad <span aria-hidden="true">→</span></a>
      </section>
      <section className="launch-grid" aria-label="RelayOps demo experiences">
        <a className="launch-card" href="/track/TRK-2048">
          <span className="launch-card-kicker">01 · CUSTOMER</span>
          <strong>Track a shipment</strong>
          <span>View the customer-safe status for TRK-2048.</span>
          <span className="launch-card-link">Open tracking <span aria-hidden="true">↗</span></span>
        </a>
        <a className="launch-card" href="/driver">
          <span className="launch-card-kicker">02 · DRIVER</span>
          <strong>Driver portal</strong>
          <span>Choose the seeded driver and inspect the assigned jobs.</span>
          <span className="launch-card-link">Open driver portal <span aria-hidden="true">↗</span></span>
        </a>
        <a className="launch-card" href="/demo#dispatcher">
          <span className="launch-card-kicker">03 · DISPATCHER</span>
          <strong>Operations dashboard</strong>
          <span>Start a signed dispatcher session from the launchpad first.</span>
          <span className="launch-card-link">Set up operations access <span aria-hidden="true">↗</span></span>
        </a>
        <a className="launch-card launch-card-featured" href="/demo">
          <span className="launch-card-kicker">04 · DEMO OPERATOR</span>
          <strong>Demo launchpad</strong>
          <span>Check health and scenario state, select a persona, or reset the local demo.</span>
          <span className="launch-card-link">Open control deck <span aria-hidden="true">↗</span></span>
        </a>
      </section>
      <footer>All records are synthetic. Demo persona sessions are issued and verified by the server.</footer>
    </main>
  );
}
