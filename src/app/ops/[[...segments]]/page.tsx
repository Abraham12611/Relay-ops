import type { Metadata } from "next";
import "../../../features/ops/ops.css";
import OpsClient from "../ops-client";

export const metadata: Metadata = {
  title: "RelayOps | Operations",
};

export default function OperationsPage() {
  return <OpsClient />;
}
