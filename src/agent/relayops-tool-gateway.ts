import type {
  Approval,
  ExecuteRequest,
  RecoveryProposalInput,
  RecoverySimulationInput,
  Shipment,
  Vehicle,
} from "../types/contracts.ts";
import type {
  RelayOpsApi,
  RelayOpsExecutionReceipt,
  RelayOpsIncidentDetail,
} from "./relayops-api.ts";

export interface RelayRecoveryTools {
  getIncident(input: { caseId: string }): Promise<RelayOpsIncidentDetail>;
  getAffectedShipments(input: { caseId: string }): Promise<readonly Shipment[]>;
  getAvailableVehicles(input: { caseId: string }): Promise<readonly Vehicle[]>;
  simulateReassignment(input: RecoverySimulationInput): ReturnType<RelayOpsApi["simulateReassignment"]>;
  proposeRecovery(input: RecoveryProposalInput): ReturnType<RelayOpsApi["proposeRecovery"]>;
  getApproval(input: { planId: string }): Promise<Approval>;
  executeApprovedReassignment(input: ExecuteRequest): Promise<RelayOpsExecutionReceipt>;
  getRecoveryStatus(input: { caseId: string }): Promise<RelayOpsIncidentDetail>;
}

/**
 * Expose only named, typed business operations to the Switch agent. There is no
 * arbitrary URL, SQL, shell, or approval-from-chat capability in this gateway.
 */
export function createRelayRecoveryTools(api: RelayOpsApi): RelayRecoveryTools {
  return {
    getIncident: ({ caseId }) => api.getIncident(caseId),
    getAffectedShipments: ({ caseId }) => api.getAffectedShipments(caseId),
    getAvailableVehicles: ({ caseId }) => api.getAvailableVehicles(caseId),
    simulateReassignment: (input) => api.simulateReassignment(input),
    proposeRecovery: (input) => api.proposeRecovery(input),
    getApproval: ({ planId }) => api.getApproval(planId),
    executeApprovedReassignment: (input) => api.executeApprovedReassignment(input),
    getRecoveryStatus: ({ caseId }) => api.getRecoveryStatus(caseId),
  };
}
