// Request state for the Memory surfaces, ported from Memory's reference
// workspace. A write keeps one idempotency key per user submission, and a
// retry resends the same closure (same payload, same key). For reads, only
// the latest request may publish its result, error or busy state.
import { useCallback, useEffect, useRef, useState } from "react";
import { call, describe, newKey, retryable, type J } from "./client";

export type Failure = { text: string; retry?: () => void } | null;

/** Run an async action with a visible busy state, error and retry. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure>(null);
  const run = useCallback(async <T,>(action: (key: string) => Promise<T>): Promise<T | undefined> => {
    const key = newKey();
    const execute = async (): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await action(key);
      } catch (err) {
        setError({ text: describe(err), retry: retryable(err) ? () => void execute() : undefined });
        return undefined;
      } finally {
        setBusy(false);
      }
    };
    return execute();
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, run, clear };
}

/** Only the latest read may publish results, errors or its busy state. */
export function useLatestRead() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current += 1; pending.current = false; }, []);
  const run = useCallback(<T,>(request: () => Promise<T>, publish: (result: T) => void, failed?: () => void) => {
    const current = ++generation.current;
    const execute = async () => {
      if (generation.current !== current) return;
      pending.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await request();
        if (generation.current === current) publish(result);
      } catch (err) {
        if (generation.current === current) {
          failed?.();
          setError({ text: describe(err), retry: retryable(err) ? () => void execute() : undefined });
        }
      } finally {
        if (generation.current === current) { pending.current = false; setBusy(false); }
      }
    };
    return execute();
  }, []);
  const clear = useCallback(() => {
    generation.current += 1;
    pending.current = false;
    setBusy(false);
    setError(null);
  }, []);
  return { busy, error, run, pending, clear };
}

/**
 * Poll `workspace_status` serially while mounted. An unknown status (failed
 * read) is `null`, which closes every Vault-dependent surface.
 */
export function useMemoryStatus(readStatus: typeof call = call) {
  const [status, setStatus] = useState<J>(null);
  const reads = useLatestRead();
  const refresh = useCallback(
    () => reads.run(() => readStatus("workspace_status"), setStatus, () => setStatus(null)),
    [readStatus, reads.run],
  );
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);
  return { status, error: reads.error, refresh };
}
