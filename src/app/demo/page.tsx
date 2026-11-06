import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolvePrincipal } from "../../lib/auth.ts";
import DemoLaunchpad from "../../features/demo/demo-launchpad";

export const metadata: Metadata = {
  title: "RelayOps | Demo launchpad",
  description: "A demo-only control deck for the synthetic RelayOps recovery scenario.",
};

export default async function DemoPage() {
  const incomingHeaders = await headers();
  const sessionRequest = new Request("http://relayops.demo/demo", {
    headers: { cookie: incomingHeaders.get("cookie") ?? "" },
  });
  const principal = resolvePrincipal(sessionRequest);
  const activeRole = principal?.kind === "persona"
    && (principal.role === "CUSTOMER" || principal.role === "DISPATCHER")
    ? principal.role
    : null;

  return <DemoLaunchpad initialActiveRole={activeRole} />;
}
