"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { mountCustomerTracking } from "../../../features/customer/customer-tracking.ts";
import "../../../features/customer/customer-tracking.css";

export default function TrackingPage() {
  const root = useRef<HTMLDivElement | null>(null);
  const params = useParams<{ trackingCode: string }>();
  const trackingCode = Array.isArray(params.trackingCode)
    ? params.trackingCode[0] ?? ""
    : params.trackingCode;

  useEffect(() => {
    const container = root.current;
    if (!container || !trackingCode) return;
    return mountCustomerTracking(container, trackingCode);
  }, [trackingCode]);

  return <div ref={root} />;
}
