// Public persona export (Enouia Memory ADR-MEM-128). The owner chooses one
// Identity revision and checked public records, reads the exact file text,
// confirms two consequences and picks a folder; Memory checks the folder and
// writes the file. Runtime judges no path and shows Memory's answers as given.
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CallError, call, describe, newKey, pick, type J } from "./client";
import { useLatestRead } from "./hooks";
import { EXPORTED_AT_SLOT, fileText, sha256Hex } from "./persona";
import { ErrorBox, Tag, when } from "./ui";
import { labels, msg, t, tn } from "../i18n/index.ts";

const AUDIENCE = "public_group";
const MAX_RECORDS = 64;
// Codes Memory answers before it reserves a version or touches a folder.
// Any other failure of a first attempt, and every failure of a resend,
// leaves the outcome unknown.
const REFUSED = new Set(["invalid_request", "revision_conflict", "idempotency_conflict", "not_found", "permission_denied", "vault_locked", "vault_recovering"]);
// Refusals after which the preview no longer describes what Memory would write.
const STALE = ["persona.preview_changed", "persona.identity_stale", "persona.identity_missing"];

type Selection = { identityId: string; revision: number } | null;
type Request = { key: string; args: Record<string, unknown>; folder: string; preview: J };
type Held = Request & { vaultId: string; error: unknown };
type Receipt = { receipt: J; preview: J };

// An export whose outcome is unknown stays here, outside the panel, so a
// page switch cannot lose its key. Only the owner resends it (Memory's rule).
let held: Held | null = null;

const BLOCK: Record<string, string> = labels({
  valid: msg("public block found"),
  missing: msg("no public block"),
  invalid: msg("public block does not follow the contract"),
});
const CHANGE: Record<string, string> = labels({ added: msg("added"), changed: msg("changed"), removed: msg("removed") });

// Memory's code and every rule as given; a host failure is Runtime's own.
function Refusal({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="mem-stack">
      <ErrorBox error={{ text: describe(error) }} />
      {error instanceof CallError && <p className="mem-mono">{t("Memory answered:")} {[error.error.code, ...error.error.rules].join(" · ")}</p>}
      {typeof error === "string" && <p className="mem-mono">{t("Runtime reported:")} {error}</p>}
    </div>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "current" | "waiting"; children: ReactNode }) {
  return (
    <li className="mem-step" data-state={state}>
      <h3 className="mem-step-head"><span className="mem-mono">{String(n).padStart(2, "0")}</span> {title}</h3>
      {children}
    </li>
  );
}

export function PersonaExport({ vaultId }: { vaultId: string }) {
  const [options, setOptions] = useState<J>(null);
  const [identity, setIdentity] = useState<Selection>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [preview, setPreview] = useState<J>(null);
  const [acks, setAcks] = useState({ provider: false, extraction: false });
  const [pending, setPendingState] = useState<Held | null>(() => held?.vaultId === vaultId ? held : null);
  const [exporting, setExporting] = useState(false);
  const [refusal, setRefusal] = useState<unknown>(null);
  const [done, setDone] = useState<Receipt | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const reads = useLatestRead();
  const previews = useLatestRead();
  const prefilled = useRef(false);
  const setPending = (next: Held | null) => { held = next; setPendingState(next); };
  const locked = exporting || pending != null;
  const shown = pending?.preview ?? preview;

  const withdraw = useCallback(() => {
    previews.clear();
    setPreview(null);
    setAcks({ provider: false, extraction: false });
    setRefusal(null);
  }, [previews.clear]);

  const readOptions = useCallback(() => void reads.run(() => call("persona_options", { audience: AUDIENCE }), (next: J) => {
    setOptions(next);
    if (prefilled.current) return;
    // Prefill from a kept request, else from the last export; the check
    // below drops anything Memory does not list now.
    prefilled.current = true;
    const from = held?.vaultId === vaultId ? held.args : next.lastExport;
    setIdentity(from ? { identityId: from.identityId as string, revision: from.identityRevision as number } : null);
    setChosen((from?.memoryIds as string[] | undefined) ?? []);
  }), [reads.run, vaultId]);
  useEffect(readOptions, [readOptions]);

  // A choice Memory no longer offers is dropped, and so is the preview. A
  // kept request is never changed; it shows what was sent.
  useEffect(() => {
    if (!options || pending) return;
    const listed = new Set<string>(options.publicMemories.map((m: J) => m.memoryId));
    const offered = identity && options.identities.some((i: J) => i.identityId === identity.identityId && i.revision === identity.revision && i.publicBlock === "valid");
    const kept = chosen.filter((id) => listed.has(id));
    if ((identity && !offered) || kept.length !== chosen.length) {
      if (!offered) setIdentity(null);
      setChosen(kept);
      withdraw();
    }
  }, [options, identity, chosen, pending, withdraw]);

  useEffect(() => {
    setVerified(null);
    if (!done) return;
    let current = true;
    void sha256Hex(fileText(done.preview, done.receipt.exportedAt, done.receipt.memoryVersion))
      .then((digest) => { if (current) setVerified(digest === done.receipt.fileSha256); });
    return () => { current = false; };
  }, [done]);

  const change = (next: () => void) => { if (locked) return; next(); withdraw(); setDone(null); };
  const selection = identity && { audience: AUDIENCE, identityId: identity.identityId, identityRevision: identity.revision, memoryIds: chosen };

  const send = async (request: Request, resend: boolean) => {
    setExporting(true);
    setRefusal(null);
    try {
      const receipt = await call("persona_export", request.args, request.key);
      setPending(null);
      setDone({ receipt, preview: request.preview });
      setPreview(request.preview);
      setAcks({ provider: false, extraction: false });
      readOptions();
    } catch (error) {
      if (!resend && error instanceof CallError && REFUSED.has(error.error.code)) {
        if (error.error.rules.some((rule) => STALE.includes(rule))) withdraw();
        setRefusal(error);
      } else {
        setPending({ ...request, vaultId, error });
      }
    } finally {
      setExporting(false);
    }
  };

  const exportTo = async (resendWith?: Held) => {
    if (exporting) return;
    setRefusal(null);
    try {
      const picked = await pick("persona_destination");
      if (!picked) return;
      if (resendWith) {
        // Same key, selection and preview digest; only the expired folder token changes.
        await send({ ...resendWith, args: { ...resendWith.args, destinationToken: picked.token }, folder: picked.displayName }, true);
        return;
      }
      if (!selection || !preview || !acks.provider || !acks.extraction) return;
      await send({ key: newKey(), args: { ...selection, previewDigest: preview.previewDigest, destinationToken: picked.token }, folder: picked.displayName, preview }, false);
    } catch (error) {
      setRefusal(error);
    }
  };

  const identities: J[] = options?.identities ?? [];
  const records: J[] = options?.publicMemories ?? [];
  const last = options?.lastExport;
  const missingFromList = last ? last.memoryIds.filter((id: string) => !records.some((m) => m.memoryId === id)).length : 0;
  const confirmed = pending != null;
  // Once Memory confirms this preview's file, show it with the recorded exported_at.
  const written = done && done.preview === shown ? done.receipt : null;
  const text = shown ? fileText(shown, written?.exportedAt ?? EXPORTED_AT_SLOT, written?.memoryVersion ?? shown.memoryVersion) : "";
  const [before, after] = text.split(JSON.stringify(EXPORTED_AT_SLOT));
  const tokenExpired = pending?.error instanceof CallError && pending.error.error.rules.includes("workspace.token_unknown");
  const stepState = (n: number) => {
    const reached = [true, !!identity, !!identity, !!shown, !!shown && acks.provider && acks.extraction, !!done][n - 1];
    const complete = [!!identity, !!identity, !!shown, acks.provider && acks.extraction, !!done || pending != null, !!done][n - 1];
    return complete ? "done" : reached ? "current" : "waiting";
  };

  return (
    <>
      <div className="qr45" aria-busy={reads.busy || previews.busy || exporting}>
        <div className="qr31">
          <h2 id="mem-center-title" className="qr29" tabIndex={-1}>{t("Public persona export")}</h2>
          <div className="qr19">{options ? tn(chosen.length, "{n} record checked", "{n} records checked") : t("Waiting for options")}</div>
          <div className="qr30" />
        </div>
        <div className="qr44">
          <div className="mem-pad mem-stack">
            <p className="mem-muted">{t("Memory writes one file for a public audience: the public block of one Identity revision and the public records you check. Everything in it may reach a model provider and anyone who can ask questions. No network, no sync, no schedule.")}</p>
            <div className="mem-actions">
              <button type="button" className="mem-button" disabled={reads.busy} onClick={readOptions}>{t("Read options again")}</button>
            </div>
            <ErrorBox error={reads.error} />
            {reads.busy && !options && <p role="status" className="mem-muted">{t("Reading Identity records and public records…")}</p>}
            {options && (
              <ol className="mem-steps">
                <Step n={1} title={t("Identity revision")} state={stepState(1)}>
                  {identities.length === 0 && <p className="mem-muted">{t("This Vault has no Identity record. Memory exports only the enouia-public-persona-1 block of an approved Identity revision.")}</p>}
                  <fieldset className="mem-choices" disabled={locked}>
                    <legend className="mem-sr">{t("Identity revision")}</legend>
                    {identities.map((row) => (
                      <label key={row.identityId} className="mem-choice">
                        <input type="radio" name="persona-identity" disabled={row.publicBlock !== "valid"}
                          checked={identity?.identityId === row.identityId && identity?.revision === row.revision}
                          onChange={() => change(() => setIdentity({ identityId: row.identityId, revision: row.revision }))} />
                        <span>{row.title}</span>
                        <span className="mem-muted">{row.slug} · {t("revision {n}", { n: row.revision })} · {BLOCK[row.publicBlock] ?? row.publicBlock}</span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="mem-muted">{t("Only the current revision with a valid public block can be chosen. Nothing outside the block is read.")}</p>
                </Step>

                <Step n={2} title={t("Public knowledge")} state={stepState(2)}>
                  <p className="mem-muted">{t("Memory lists only public records. A record leaves only if you check it here.")}{" "}
                    {tn(chosen.length, "{n} of {max} checked.", "{n} of {max} checked.", { max: MAX_RECORDS })}</p>
                  {options.truncated && <p className="mem-warn">{t("Memory listed {shown} of {total} public records.", { shown: records.length, total: options.publicMemoriesTotal })}</p>}
                  {missingFromList > 0 && <p className="mem-muted">{tn(missingFromList, "{n} record from the last export is no longer listed. It is not checked and will show as removed.", "{n} records from the last export are no longer listed. They are not checked and will show as removed.")}</p>}
                  {records.length === 0 && <p className="mem-muted">{t("No public record in this Vault.")}</p>}
                  <fieldset className="mem-choices" disabled={locked}>
                    <legend className="mem-sr">{t("Public knowledge")}</legend>
                    {records.map((m) => {
                      const checked = chosen.includes(m.memoryId);
                      return (
                        <label key={m.memoryId} className="mem-choice">
                          <input type="checkbox" checked={checked} disabled={!checked && chosen.length >= MAX_RECORDS}
                            onChange={(e) => change(() => setChosen((all) => e.target.checked ? [...all, m.memoryId] : all.filter((id) => id !== m.memoryId)))} />
                          <span>{m.title}</span>
                          <span className="mem-muted">{m.type}{m.tags.length > 0 && ` · ${m.tags.join(", ")}`}</span>
                          {m.namesPeople && <Tag tone="warn">{t("names people")}</Tag>}
                        </label>
                      );
                    })}
                  </fieldset>
                </Step>

                <Step n={3} title={t("Preview")} state={stepState(3)}>
                  <div className="mem-actions">
                    <button type="button" className="mem-button" disabled={!selection || previews.busy || locked}
                      onClick={() => { if (selection && !locked) { setDone(null); setRefusal(null); void previews.run(() => call("persona_preview", selection), setPreview); } }}>
                      {shown ? t("Preview again") : t("Preview the file")}</button>
                  </div>
                  <ErrorBox error={previews.error} />
                  {previews.busy && <p role="status" className="mem-muted">{t("Memory is building the preview…")}</p>}
                  {shown && (
                    <div className="mem-stack">
                      <dl className="mem-facts">
                        <dt>{t("Version")}</dt><dd>v{shown.version}{shown.diff.baselineVersion === shown.version ? ` · ${t("same content as the last export")}` : ""}</dd>
                        <dt>{t("Projection SHA-256")}</dt><dd className="mem-mono">{shown.projectionSha256}</dd>
                        <dt>{t("Contract")}</dt><dd className="mem-mono">{shown.contract} · {shown.memoryVersion}</dd>
                      </dl>
                      <h4 className="mem-h4">{shown.diff.baselineVersion == null ? t("No earlier export. Everything below is new.") : t("Changes since the last export (v{n})", { n: shown.diff.baselineVersion })}</h4>
                      {shown.diff.baselineVersion != null && shown.diff.fields.length === 0 && shown.diff.knowledge.length === 0 && <p className="mem-muted">{t("No change.")}</p>}
                      {(shown.diff.fields.length > 0 || shown.diff.knowledge.length > 0) && (
                        <ul className="mem-list mem-diff-list">
                          {shown.diff.fields.map((f: J) => <li key={f.field}><span className="mem-mono">{f.field}</span> · {CHANGE[f.change] ?? f.change}</li>)}
                          {shown.diff.knowledge.map((k: J) => {
                            const item = shown.projection.public_knowledge.find((p: J) => p.item_id === k.itemId);
                            return (
                              <li key={k.itemId}>
                                {CHANGE[k.change] ?? k.change} · <span className="mem-mono">{k.itemId}</span> · <span className="mem-mono">{k.source.memory_id}</span> {t("revision {n}", { n: k.source.memory_revision })}
                                {k.change === "removed" ? <span className="mem-muted"> · {t("text not shown")}</span> : item && <span> · {item.text}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {shown.diff.unchangedKnowledge > 0 && <p className="mem-muted">{tn(shown.diff.unchangedKnowledge, "{n} public item unchanged.", "{n} public items unchanged.")}</p>}
                      <h4 className="mem-h4">{t("Left out (counts only)")}</h4>
                      <dl className="mem-facts">
                        <dt>{t("Identity lines outside the block")}</dt><dd>{shown.exclusions.identityLinesOutsideBlock}</dd>
                        <dt>{t("Other Identity records")}</dt><dd>{shown.exclusions.otherIdentityRecords}</dd>
                        {Object.entries(shown.exclusions.memoriesNotPublic as Record<string, number>).map(([level, n]) => (
                          <Fragment key={level}><dt>{t("Records not public ({level})", { level })}</dt><dd>{n}</dd></Fragment>
                        ))}
                        <dt>{t("Public records not checked")}</dt><dd>{shown.exclusions.publicMemoriesNotSelected}</dd>
                        <dt>{t("Checked but not public")}</dt><dd>{shown.exclusions.selectedNotPublic}</dd>
                        <dt>{t("Checked but unavailable")}</dt><dd>{shown.exclusions.selectedUnavailable}</dd>
                      </dl>
                      {shown.warnings.map((w: J) => (
                        <p key={w.code} className="mem-warn">{w.code === "names_people"
                          ? tn(w.itemIds.length, "{n} public item names a person. Check that it is yours to share.", "{n} public items name people. Check that each is yours to share.")
                          : w.code === "relationship_identity" ? t("This is the relationship Identity. Check that nothing here is meant only for you.") : w.code}</p>
                      ))}
                      <h4 className="mem-h4">{t("The whole file")}</h4>
                      <p className="mem-muted">{written
                        ? t("This is the written file, including the exported_at Memory recorded.")
                        : t("This is every character Memory will write. Only exported_at is filled in when the file is written.")}</p>
                      <pre className="mem-pre mem-pre-file" tabIndex={0} aria-label={t("The whole file")}>{before}{after !== undefined && <><span className="mem-slot">{t("‹exported_at, set when written›")}</span>{after}</>}</pre>
                    </div>
                  )}
                </Step>

                <Step n={4} title={t("Confirm")} state={stepState(4)}>
                  <fieldset className="mem-choices" disabled={!shown || locked || !!written}>
                    <legend className="mem-sr">{t("Confirm")}</legend>
                    <label className="mem-choice"><input type="checkbox" checked={acks.provider || confirmed} onChange={(e) => setAcks((a) => ({ ...a, provider: e.target.checked }))} />
                      <span>{t("These contents will be sent to model providers.")}</span></label>
                    <label className="mem-choice"><input type="checkbox" checked={acks.extraction || confirmed} onChange={(e) => setAcks((a) => ({ ...a, extraction: e.target.checked }))} />
                      <span>{t("Group members may draw these contents out by asking questions.")}</span></label>
                  </fieldset>
                  {shown && !written && <p className="mem-muted">{t("Both are needed. Changing the selection clears them.")}</p>}
                  {written && <p className="mem-muted">{t("This preview was exported. The export is now the baseline, so preview again before another export.")}</p>}
                </Step>

                <Step n={5} title={t("Save location")} state={stepState(5)}>
                  <p className="mem-muted">{t("The Windows folder picker opens. Memory checks the folder and refuses places such as Git repositories, worktrees and Vault folders. It never replaces an existing file.")}</p>
                  <div className="mem-actions">
                    <button type="button" className="mem-button mem-primary" disabled={!preview || !acks.provider || !acks.extraction || locked || !!written}
                      onClick={() => void exportTo()}>{t("Choose folder and export…")}</button>
                  </div>
                  {exporting && <p role="status" className="mem-muted">{t("Waiting for Memory to write the file…")}</p>}
                  <Refusal error={refusal} />
                  {pending && !exporting && (
                    <div className="mem-held" role="alert">
                      <p className="mem-warn">{t("Outcome unknown. The export to “{folder}” returned no confirmed result. Memory may have reserved the version or written the file. The request is kept with its key; nothing is resent automatically.", { folder: pending.folder })}</p>
                      <Refusal error={pending.error} />
                      <div className="mem-actions">
                        <button type="button" className="mem-button mem-primary" onClick={() => void send(pending, true)}>{t("Send the same request again")}</button>
                        {tokenExpired && <button type="button" className="mem-button" onClick={() => void exportTo(pending)}>{t("Choose the folder again and send")}</button>}
                        <button type="button" className="mem-button" onClick={() => { setPending(null); withdraw(); }}>{t("Set this request aside")}</button>
                      </div>
                      <p className="mem-muted">{t("Sending again uses the same key and selection: Memory then writes what it reserved, or returns the receipt it already has. Setting the request aside forgets its key in this window.")}</p>
                    </div>
                  )}
                </Step>

                <Step n={6} title={t("Receipt")} state={stepState(6)}>
                  {!done && <p className="mem-muted">{t("No export in this window yet. A receipt appears only when Memory confirms the file.")}</p>}
                  {done && (
                    <div className="mem-stack" role="status">
                      <p>{done.receipt.replayed ? t("Memory returned the receipt of this same request. Nothing new was written.") : t("Memory wrote {file}.", { file: done.receipt.fileName })}</p>
                      <dl className="mem-facts mem-receipt">
                        <dt>{t("Version")}</dt><dd>v{done.receipt.version}</dd>
                        <dt>{t("File SHA-256")}</dt><dd className="mem-mono">{done.receipt.fileSha256}</dd>
                        <dt>{t("File")}</dt><dd className="mem-mono">{done.receipt.fileName} · {t("{n} bytes", { n: done.receipt.bytes })}</dd>
                        <dt>{t("Projection SHA-256")}</dt><dd className="mem-mono">{done.receipt.projectionSha256}</dd>
                        <dt>{t("Exported at")}</dt><dd>{when(done.receipt.exportedAt)} <span className="mem-mono">{done.receipt.exportedAt}</span></dd>
                      </dl>
                      {verified == null && <p className="mem-muted">{t("Checking the previewed text against the file SHA-256…")}</p>}
                      {verified === true && <p className="mem-muted">{t("The previewed text with this exported_at has the same SHA-256 as the written file.")}</p>}
                      {verified === false && <p className="mem-warn">{t("The previewed text does not match the file SHA-256. Check the file itself before using it.")}</p>}
                      <p className="mem-muted">{t("On the receiving computer, compare the file's SHA-256 and version with these before using it.")}</p>
                    </div>
                  )}
                </Step>
              </ol>
            )}
          </div>
        </div>
      </div>
      <aside aria-label={t("Memory Inspector")} className="qr88">
        <div className="qr79">
          <h3 className="mem-h3">{t("What leaves Memory")}</h3>
          <ul className="mem-list mem-muted">
            <li>{t("The enouia-public-persona-1 block of the one Identity revision you choose.")}</li>
            <li>{t("Public records you check. Unchecked or non-public records stay out; only their counts are shown.")}</li>
            <li>{t("Memory writes the file once to the folder you pick. It does not send, sync or schedule anything.")}</li>
          </ul>
          <h3 className="mem-h3">{t("Last export")}</h3>
          {!options ? <p className="mem-muted">{t("unknown")}</p> : last ? (
            <dl className="mem-facts">
              <dt>{t("Version")}</dt><dd>v{last.version}</dd>
              <dt>{t("File")}</dt><dd className="mem-mono">{last.fileName}</dd>
              <dt>{t("File SHA-256")}</dt><dd className="mem-mono">{last.fileSha256}</dd>
              <dt>{t("Exported at")}</dt><dd>{when(last.exportedAt)}</dd>
            </dl>
          ) : <p className="mem-muted">{t("No export recorded in this Vault.")}</p>}
          <h3 className="mem-h3">{t("Refused folders")}</h3>
          <p className="mem-muted">{t("Memory decides. It refuses Git repositories and worktrees, the open Vault and any Vault folder, and network, sync, removable or system locations. Runtime shows its answer as given.")}</p>
        </div>
      </aside>
    </>
  );
}
