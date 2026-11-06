"use client";

import { useEffect, useRef } from "react";
import { mountDriverIncidentReport } from "../../../../features/driver/views.ts";
import "../../../../features/driver/driver.css";

export default function NewDriverIncidentPage() {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const mounted = mountDriverIncidentReport(container);
    return () => mounted.unmount();
  }, []);

  return <div ref={root} />;
}
