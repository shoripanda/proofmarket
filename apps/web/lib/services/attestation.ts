// What an agent asked a person to confirm it did (13 §5), as the API shows it; null on an ordinary task.
import type { AgentAttestation } from "@proofmarket/core/schemas/api";

export function attestationOf(t: { attestation: unknown }): AgentAttestation | null {
  const a = t.attestation as Partial<AgentAttestation> | null;
  return a?.subject === "agent_action" && typeof a.description === "string"
    ? { subject: "agent_action", description: a.description }
    : null;
}
