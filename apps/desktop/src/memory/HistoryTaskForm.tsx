// Product UI for local task admission; writes belong to the stable Import owner.
import { useEffect, useId, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { historyCostMicrousd, validHistoryTaskRequest, type HistoryTaskRequest } from "./historyTasks";
import { ErrorBox } from "./ui";

import { t } from '../i18n/index.ts';
type Model = { api: "openai" | "anthropic"; model: string };
const count = (text: string, max: number) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0 && Number(text) <= max;

export function HistoryTaskForm({ vaultId, plan, selected, busy, onCreate, request = call }: {
  vaultId: string; plan: J; selected: number[]; busy: boolean; onCreate: (args: HistoryTaskRequest) => void; request?: typeof call;
}) {
  const id = useId(), read = useLatestRead();
  const [models, setModels] = useState<Model[] | null>(null), [model, setModel] = useState("");
  const [candidates, setCandidates] = useState("8"), [pending, setPending] = useState("100"), [tokens, setTokens] = useState("10000"), [cost, setCost] = useState("");
  const refresh = () => {
    if (read.pending.current || busy) return;
    setModels(null); setModel("");
    void read.run(async () => {
      const result = await request("provider_status");
      if (typeof result?.configured !== "boolean" || !Array.isArray(result.destinations) || result.destinations.length > 2) throw new Error("configured model observation mismatch");
      const next: Model[] = [], seen = new Set<string>();
      for (const destination of result.destinations) {
        if (!["openai", "anthropic"].includes(destination?.api) || typeof destination.model !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(destination.model)
          || seen.has(destination.api)) throw new Error("configured model observation mismatch");
        seen.add(destination.api);
        if (destination.verifiedAt !== null) {
          if (typeof destination.verifiedAt !== "string" || !Number.isFinite(Date.parse(destination.verifiedAt))) throw new Error("configured model observation mismatch");
          next.push({ api: destination.api, model: destination.model });
        }
      }
      return result.configured ? next : [];
    }, setModels);
  };
  useEffect(() => {
    read.clear(); setModels(null); setModel(""); refresh();
    return read.clear;
  }, [vaultId, request, read.clear]); // Each Vault gets its own model observation.
  const chosen = models?.find(item => `${item.api}/${item.model}` === model), parsedCost = historyCostMicrousd(cost);
  const valid = !!plan && selected.length > 0 && selected.length <= 32 && chosen && count(candidates, 32) && count(pending, 500) && count(tokens, Number.MAX_SAFE_INTEGER) && parsedCost !== undefined;
  const submit = () => {
    if (busy || read.pending.current || !valid || !chosen) return;
    const identity = plan.identity;
    const args: HistoryTaskRequest = { importId: identity.importId, importRevision: identity.importRevision,
      inputObjectHash: identity.inputObjectHash, planHash: plan.planHash, previewCommitId: identity.commitId,
      messagesPerBatch: identity.messagesPerBatch, maxPathReferences: identity.maxPathReferences, batchIndices: [...selected],
      api: chosen.api, model: chosen.model, maxCandidates: Number(candidates), maxPending: Number(pending),
      maxReservedTokens: Number(tokens), maxReservedCostMicrousd: parsedCost! };
    if (identity.vaultId !== vaultId || !validHistoryTaskRequest(args) || selected.some(index => index >= plan.summary.batches)) return;
    onCreate(args);
  };
  return <section className="mem-card mem-stack" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`} className="mem-h3">{t("Create local history tasks")}</h4>
    <p className="mem-muted">{t("Save your selected batches as pending local jobs. Model calls and memory review are separate actions.")}</p>
    <p className="mem-muted">Selected order: {selected.length ? selected.map(index => index + 1).join(" → ") : "Choose batches above"} · {selected.length}/32</p>
    <ErrorBox error={read.error} />
    <button type="button" className="mem-button" disabled={busy || read.busy} onClick={refresh}>{t("Read configured history models")}</button>
    {read.busy && <p role="status" className="mem-muted">{t("Reading configured models…")}</p>}
    {models?.length === 0 && <p className="mem-muted">{t("First save an exact text model and its verified capabilities in Sessions settings.")}</p>}
    <fieldset disabled={busy || read.busy} className="mem-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="mem-label">{t("Per-batch limits")}</legend>
      <label className="mem-label" htmlFor={`${id}-model`}>{t("History task model")}</label>
      <select id={`${id}-model`} className="mem-input" value={model} onChange={event => setModel(event.target.value)}>
        <option value="">{t("Choose a configured model")}</option>
        {models?.map(item => <option key={item.api} value={`${item.api}/${item.model}`}>{item.api} · {item.model}</option>)}
      </select>
      {([["candidates", t("Maximum suggestions per batch (1–32)"), candidates, setCandidates, 32],
        ["pending", t("Maximum pending candidates (1–500)"), pending, setPending, 500],
        ["tokens", "Maximum reserved tokens per batch", tokens, setTokens, Number.MAX_SAFE_INTEGER]] as const).map(([field, label, value, edit, max]) => <div key={field} className="mem-stack">
          <label className="mem-label" htmlFor={`${id}-${field}`}>{label}</label>
          <input id={`${id}-${field}`} className="mem-input" inputMode="numeric" autoComplete="off" value={value} aria-invalid={!count(value, max)} onChange={event => edit(event.target.value)} />
        </div>)}
      <label className="mem-label" htmlFor={`${id}-cost`}>Cost ceiling per batch (USD, optional)</label>
      <input id={`${id}-cost`} className="mem-input" inputMode="decimal" autoComplete="off" value={cost} aria-invalid={parsedCost === undefined}
        aria-describedby={`${id}-cost-help`} onChange={event => setCost(event.target.value)} />
      <p id={`${id}-cost-help`} className="mem-muted">{t("Blank keeps cost unknown. Zero is a zero ceiling. Use up to six decimal places. Saving a limit does not reserve tokens or money.")}</p>
    </fieldset>
    <button type="button" className="mem-button mem-primary" disabled={busy || read.busy || !valid} onClick={submit}>Create {selected.length} local batch tasks</button>
  </section>;
}
