import { Gate, GateInput, GateResult } from "./gate.js";
import { claimVsDiff } from "./gates/claimVsDiff.js";
import { agentsMd } from "./gates/agentsMd.js";

// All built-in gates. New gates register here.
export const allGates: Gate[] = [claimVsDiff, agentsMd];

export async function runGates(input: GateInput, gates: Gate[] = allGates): Promise<GateResult[]> {
  return Promise.all(gates.map((g) => g.run(input)));
}
