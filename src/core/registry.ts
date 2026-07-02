import { Gate, GateInput, GateResult } from "./gate.js";
import { claimVsDiff } from "./gates/claimVsDiff.js";

// All built-in gates. New gates register here.
export const allGates: Gate[] = [claimVsDiff];

export async function runGates(input: GateInput, gates: Gate[] = allGates): Promise<GateResult[]> {
  return Promise.all(gates.map((g) => g.run(input)));
}
