// Original proposals and current candidate observations are Core records;
// neither substitutes for the current content of an approved memory.
import { type J } from "./client";
import { Tag, shortId } from "./ui";

export function SuggestionPreview({ preview }: { preview: J }) {
  return <>
    <p className="mem-muted">{preview.items.length} suggestion{preview.items.length === 1 ? "" : "s"}. Each quote is checked against the source; that does not make the suggestion true.</p>
    <p className="mem-muted">This preview shows suggestions and candidate records. Read approved memories in Memory Vault for their current content, including edits made during review.</p>
    <ul className="mem-list">
      {preview.items.map((i: J) => <li key={i.responseIndex} className="mem-stack">
        <span><Tag>{i.proposedType}</Tag> {i.content}</span>
        <span className="mem-muted">Quote: “{i.quote}”</span>
        <span className="mem-muted">In: {i.selectedText}</span>
        {i.candidate && <div className="mem-stack">
          <span><Tag tone={i.candidate.status === "pending" ? "warn" : "muted"}>{i.candidate.status}</Tag> candidate · {shortId(i.candidate.candidateId)} · r{i.candidate.revision}</span>
          {i.candidate.content !== i.content && <span className="mem-muted">Current candidate: {i.candidate.content}</span>}
        </div>}
        {!i.candidate && i.application === "suppressed" && <span className="mem-muted">No candidate recorded for this suggestion.</span>}
      </li>)}
    </ul>
  </>;
}
