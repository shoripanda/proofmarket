import "server-only";

export async function listWorkerTasks(_workerId: string, _q: { lat: number; lng: number; radiusKm: number }) {
  throw new Error("NOT_IMPLEMENTED: listWorkerTasks (PR-05)");
}

export async function claimTask(_workerId: string, _verificationId: string) {
  throw new Error("NOT_IMPLEMENTED: claimTask (PR-05)");
}

export async function issueChallenge(_workerId: string, _claimId: string) {
  throw new Error("NOT_IMPLEMENTED: issueChallenge (PR-05)");
}

export async function abandonClaim(_workerId: string, _claimId: string) {
  throw new Error("NOT_IMPLEMENTED: abandonClaim (PR-05)");
}
