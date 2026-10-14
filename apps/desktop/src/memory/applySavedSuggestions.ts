// The pinned Core advances a saved extraction cursor one item per call;
// these writes do not authorize a model request or approve a memory.
import { CallError, call, type J } from "./client";
import { suggestionObservation } from "./observationIdentity";

function requireObservation(err: unknown): never {
  if (err instanceof CallError) throw new CallError({ ...err.error, retryable: false });
  throw err;
}

export async function applySavedSuggestions(request: typeof call, job: { sessionId: string; runId: string }, items: number, isActive: () => boolean): Promise<J | null> {
  try {
    for (let n = 0; n <= items; n += 1) {
      if (!isActive()) return null;
      const applied = await request("extraction_apply", job);
      if (!isActive()) return null;
      suggestionObservation(applied, job.runId);
      if (applied.job.state === "completed") break;
    }
    if (!isActive()) return null;
    const preview = await request("extraction_preview", job);
    return isActive() ? suggestionObservation(preview, job.runId) : null;
  } catch (err) {
    // A receipt or the final read may fail after a committed cursor step.
    // Preserve its explanation, but require observation before another batch.
    return requireObservation(err);
  }
}

/** Resume the saved local queue only; another gesture decides to apply. */
export async function resumeSavedSuggestions(request: typeof call, job: { sessionId: string; runId: string }, isActive: () => boolean): Promise<J | null> {
  try {
    if (!isActive()) return null;
    const resumed = await request("extraction_pause", { ...job, paused: false });
    if (!isActive()) return null;
    suggestionObservation(resumed, job.runId);
    const preview = await request("extraction_preview", job);
    return isActive() ? suggestionObservation(preview, job.runId) : null;
  } catch (err) {
    return requireObservation(err);
  }
}
