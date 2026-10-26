// A read-only view of one existing import_list row. The Core owns every
// count; this view neither reparses raw input nor plans model extraction.
import type { J } from "./client";
import { when } from "./ui";
import { HistoryPlan } from "./HistoryPlan";
import type { HistoryTaskRequest } from "./historyTasks";

import { msg, t } from '../i18n/index.ts';
const COUNTS = [
  [msg("Sources created"), "sources_created"], [msg("Sources revised"), "sources_revised"],
  [msg("Sources unchanged"), "sources_unchanged"], [msg("Conversations"), "conversations"],
  [msg("Branches"), "branches"], [msg("Missing parents"), "missing_parents"],
  [msg("Unparseable items"), "unparseable"], [msg("Attachments present"), "attachments_present"],
  [msg("Attachments missing"), "attachments_missing"], [msg("External attachments"), "attachments_external"],
  [msg("Attachments quarantined"), "attachments_quarantined"],
] as const;

const count = (value: unknown): string => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : "unknown";

export function ImportReport({ row, current, selected, vaultId, vaultHead, inspectOriginal, close, onCreateHistory, historyBusy = false }: {
  row: J; current: boolean; selected: string; vaultId?: string; vaultHead?: string; inspectOriginal?: () => void; close: () => void;
  onCreateHistory?: (args: HistoryTaskRequest) => void; historyBusy?: boolean;
}) {
  return <div className="mem-stack" aria-label={t("Import report")}>
    <h3 id="mem-import-report-title" tabIndex={-1} className="mem-h3">{t("Import report")}</h3>
    <p className="mem-mono">{selected}</p>
    <button type="button" className="mem-button" onClick={close}>{t("Close report")}</button>
    {!current ? <p role="status" className="mem-muted">{t("Read the import list successfully before inspecting this report. Its current result is unknown.")}</p>
      : !row ? <p role="status" className="mem-muted">{t("This import is not in the latest list. No report is selected from another import.")}</p>
      : <>
        <p className="mem-muted">{row.duplicateOf
          ? t("These exact bytes were already imported. This duplicate entry does not parse them again; inspect the original import for its result.")
          : row.status === "completed"
          ? t("Import processing completed for the received input. This does not establish complete platform history or approved memories.")
          : row.status === "parsing" || row.status === "archived"
          ? t("This import is unfinished. The observed counts describe saved work so far; Resume remains an explicit action in the list.")
          : t("This status does not establish complete parsing. Check its counts and warning codes.")}</p>
        {(row.inputKind === "unknown" || row.inputKind === "unknown_archive") && <p className="mem-warn">{t("The input format was not recognized. Keeping its original bytes does not mean its contents were parsed.")}</p>}
        <dl className="mem-facts">
          <dt>{t("Status")}</dt><dd>{row.status}</dd>
          <dt>{t("Report revision")}</dt><dd>{count(row.revision)}</dd>
          <dt>{t("Format")}</dt><dd>{row.inputKind}</dd>
          <dt>{t("Account alias")}</dt><dd>{row.accountScope ?? t("not recorded")}</dd>
          <dt>{t("Input bytes")}</dt><dd>{count(row.inputSizeBytes)}</dd>
          <dt>{t("Received")}</dt><dd>{when(row.receivedAt)}</dd>
          <dt>{t("Updated")}</dt><dd>{when(row.updatedAt)}</dd>
          {COUNTS.map(([label, field]) => <div key={field} style={{ display: "contents" }}><dt>{t(label)}</dt><dd>{count(row.counts?.[field])}</dd></div>)}
          <dt>{t("Coverage entries")}</dt><dd>{count(row.conversationsCovered)}</dd>
          <dt>{t("Quarantined archive members")}</dt><dd>{count(row.membersQuarantined)}</dd>
        </dl>
        <p className="mem-muted">{t("Coverage entries count the conversations or files represented in this import's report. They do not measure all of your history, extraction quality or review completion.")}</p>
        <h4 className="mem-h3">{t("Warning codes")}</h4>
        {!Array.isArray(row.warnings) ? <p className="mem-muted">{t("unknown")}</p> : row.warnings.length === 0 ? <p className="mem-muted">{t("No warning codes recorded.")}</p>
          : <ul className="mem-list mem-mono">{row.warnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}</ul>}
        {row.duplicateOf && <>
          <p className="mem-mono">Original import: {row.duplicateOf}</p>
          {inspectOriginal ? <button type="button" className="mem-button" onClick={(event) => {
            const trigger = event.currentTarget;
            const heading = document.getElementById("mem-import-report-title");
            inspectOriginal();
            requestAnimationFrame(() => {
              if (heading?.isConnected && (document.activeElement === trigger || document.activeElement === document.body)) heading.focus();
            });
          }}>{t("Inspect original import")}</button>
            : <p className="mem-muted">{t("The original import is not in the latest list.")}</p>}
        </>}
        {vaultId && row.importId === selected && row.status === "completed" && !row.duplicateOf && Number.isSafeInteger(row.revision) && row.revision > 0
          && <HistoryPlan key={`${vaultId}:${vaultHead ?? "unobserved"}:${selected}:${row.revision}`} vaultId={vaultId} importId={selected} importRevision={row.revision}
            onCreate={onCreateHistory} materializationBusy={historyBusy} />}
      </>}
  </div>;
}
