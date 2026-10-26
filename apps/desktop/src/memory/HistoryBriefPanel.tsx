import { useEffect, useState } from "react";
import { call, describe, type J } from "./client";
import { type ComparisonChoice } from "./historyComparison";
import { HistoryBriefOwner } from "./historyBrief";

import { t } from '../i18n/index.ts';
/** Plain text only: source/model/owner text never becomes rendered Markdown or HTML. */
export function HistoryBriefPanel({ vaultId, choices, comparison, request = call }: {
  vaultId: string; choices: readonly ComparisonChoice[]; comparison: J; request?: typeof call;
}) {
  return <BoundBrief key={JSON.stringify([vaultId, choices, comparison])} vaultId={vaultId}
    choices={choices} comparison={comparison} request={request}/>;
}
function BoundBrief({ vaultId, choices, comparison, request }: {
  vaultId: string; choices: readonly ComparisonChoice[]; comparison: J; request: typeof call;
}) {
  const [owner] = useState(()=>new HistoryBriefOwner(vaultId));
  const [selected] = useState(()=>({ choices: structuredClone(choices), comparison: structuredClone(comparison) }));
  const [view,setView] = useState<J>(null),[busy,setBusy] = useState(false),[error,setError] = useState("");
  useEffect(()=>{
    owner.select(selected.choices,selected.comparison);
    return ()=>owner.invalidate();
  },[owner,selected]);
  async function read() {
    if(owner.snapshot.reading)return;
    setView(null);setBusy(true);setError("");
    try{const result=await owner.read(request);if(owner.snapshot.selected)setView(result);}
    catch(e){if(owner.snapshot.selected)setError(describe(e));}
    finally{if(owner.snapshot.selected)setBusy(false);}
  }
  return <section className="mem-stack" aria-label={t("Source-linked history brief")} aria-busy={busy}>
    <h4 className="mem-h3">{t("Local source navigation brief")}</h4>
    <p className="mem-muted">{t("All selected completed responses only. This deterministic dossier is not a generated summary, Canonical memory or proof that history is complete. No file is saved or sent.")}</p>
    <div><button type="button" className="mem-button" disabled={busy} onClick={()=>void read()}>{t("Read source navigation brief")}</button></div>
    {error&&<p role="alert" className="mem-error">{error}</p>}
    {view&&<div className="mem-stack">
      <p className="mem-muted">Snapshot {view.base.commitId} · SHA-256 {view.contentHash}</p>
      <pre className="mem-content" aria-label={t("History brief plain text")}>{view.markdown}</pre>
    </div>}
  </section>;
}
