"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { mountDriverShipmentDetails } from "../../../../features/driver/views.ts";
import "../../../../features/driver/driver.css";

export default function DriverShipmentPage() {
  const root = useRef<HTMLDivElement | null>(null);
  const params = useParams<{ shipmentId: string }>();
  const shipmentId = Array.isArray(params.shipmentId)
    ? params.shipmentId[0] ?? ""
    : params.shipmentId;

  useEffect(() => {
    const container = root.current;
    if (!container || !shipmentId) return;
    const mounted = mountDriverShipmentDetails(container, shipmentId);
    return () => mounted.unmount();
  }, [shipmentId]);

  return <div ref={root} />;
}
