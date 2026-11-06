/**
 * Local visual-preview host for the isolated ops feature.
 * The optional fixture adapter is read-only and explicitly synthetic; it does not
 * imitate agent output, approval, execution, or Mattermost. Never ship this host.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_SCENARIO, getAffectedShipments } from "../../fixtures/scenario.ts";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const fixtureEnabled = process.env.OPS_UI_PREVIEW_FIXTURE === "true";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }).end(JSON.stringify(payload));
}

function fixtureApi(request, response, url) {
  if (!fixtureEnabled || !url.pathname.startsWith("/__preview-api/v1/")) return false;
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "READ_ONLY_PREVIEW", message: "Fixture preview only permits GET requests.", correlationId: "preview-read-only" } });
    return true;
  }

  const path = url.pathname.slice("/__preview-api/v1".length);
  if (path === "/health") {
    sendJson(response, 200, { data: { status: "fixture", healthy: true, source: "read-only synthetic fixture" }, correlationId: "preview-health" });
    return true;
  }
  if (path === "/incidents") {
    const incidents = DEMO_SCENARIO.incidents.map((incident) => ({
      ...incident,
      affectedShipmentCount: getAffectedShipments(DEMO_SCENARIO, incident.id).length,
    }));
    sendJson(response, 200, { data: incidents, correlationId: "preview-incidents" });
    return true;
  }

  const eventMatch = path.match(/^\/incidents\/([^/]+)\/events$/);
  if (eventMatch) {
    const caseId = decodeURIComponent(eventMatch[1]);
    sendJson(response, 200, { data: DEMO_SCENARIO.events.filter((event) => event.caseId === caseId), correlationId: `preview-events-${caseId}` });
    return true;
  }
  const incidentMatch = path.match(/^\/incidents\/([^/]+)$/);
  if (incidentMatch) {
    const caseId = decodeURIComponent(incidentMatch[1]);
    const incident = DEMO_SCENARIO.incidents.find((item) => item.id === caseId);
    if (!incident) {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: `Incident ${caseId} was not found.`, correlationId: `preview-case-${caseId}` } });
      return true;
    }
    const vehicle = DEMO_SCENARIO.vehicles.find((item) => item.id === incident.vehicleId) ?? null;
    const driver = DEMO_SCENARIO.drivers.find((item) => item.userId === incident.reporterId) ?? null;
    sendJson(response, 200, {
      data: {
        incident,
        affectedShipments: getAffectedShipments(DEMO_SCENARIO, caseId),
        vehicle,
        driver,
        currentPlan: null,
        mattermostRoomUrl: null,
      },
      correlationId: `preview-case-${caseId}`,
    });
    return true;
  }

  const shipmentMatch = path.match(/^\/shipments\/([^/]+)$/);
  if (shipmentMatch) {
    const shipmentId = decodeURIComponent(shipmentMatch[1]);
    const shipment = DEMO_SCENARIO.shipments.find((item) => item.id === shipmentId);
    if (!shipment) {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: `Shipment ${shipmentId} was not found.`, correlationId: `preview-shipment-${shipmentId}` } });
      return true;
    }
    const relation = DEMO_SCENARIO.incidentShipments.find((item) => item.shipmentId === shipmentId);
    const events = relation ? DEMO_SCENARIO.events.filter((event) => event.caseId === relation.incidentId) : [];
    sendJson(response, 200, { data: { shipment, incidentId: relation?.incidentId ?? null, events }, correlationId: `preview-shipment-${shipmentId}` });
    return true;
  }

  if (path === "/vehicles/available") {
    sendJson(response, 200, { data: DEMO_SCENARIO.vehicles.filter((vehicle) => vehicle.status === "AVAILABLE"), correlationId: "preview-vehicles" });
    return true;
  }
  sendJson(response, 404, { error: { code: "PREVIEW_ROUTE_NOT_FOUND", message: "The feature preview has no handler for this route.", correlationId: "preview-route" } });
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (fixtureApi(request, response, url)) return;

  if (url.pathname === "/") {
    response.writeHead(302, { Location: "/ops?preview=fixture" }).end();
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 503, { error: { code: "PREVIEW_BACKEND_UNAVAILABLE", message: "The isolated UI preview does not include the RelayOps application API.", correlationId: "preview-no-backend" } });
    return;
  }
  if (!url.pathname.startsWith("/ops")) {
    response.writeHead(404).end("Not found");
    return;
  }

  let relativePath = url.pathname === "/ops" || url.pathname === "/ops/"
    ? "index.html"
    : url.pathname.slice("/ops/".length);
  if (!extname(relativePath)) relativePath = "index.html";

  let filePath;
  try {
    filePath = resolve(root, decodeURIComponent(relativePath));
  } catch {
    response.writeHead(400).end("Bad path");
    return;
  }
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    }).end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`RelayOps ops UI preview listening on 0.0.0.0:${port}${fixtureEnabled ? " with read-only synthetic fixture" : " without fixture data"}`);
});
