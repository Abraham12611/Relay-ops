"use client";

import { useEffect, useRef } from "react";
import { mountOpsApp } from "../../features/ops/ops.js";

export default function OpsClient() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const app = mountOpsApp(root);
    return () => app.destroy();
  }, []);

  return (
    <div id="app" ref={rootRef} data-ops-mount="manual" aria-live="off">
      <div className="boot-loader" role="status">
        <span className="spinner" aria-hidden="true" /> Connecting to RelayOps…
      </div>
    </div>
  );
}
