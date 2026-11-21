// Display words for values the pinned Memory catalog returns. Unknown values
// stay visible as their raw code rather than being guessed.
import { labels, msg, t } from "../i18n";
import { nativeDate } from "../theme/nativeTime";
import type { RecordTime } from "./catalog";

const WORDS: Record<string, string> = labels({
  episode: msg("Episode"), fact: msg("Fact"), preference: msg("Preference"), relationship_experience: msg("Relationship experience"),
  theme: msg("Theme"), attributed_statement: msg("Attributed statement"), hypothesis: msg("Hypothesis"),
  adopted: msg("Adopted"), staged: msg("Staged"), active: msg("Active"), protected: msg("Protected"), fading: msg("Fading"), archived: msg("Archived"),
  unspecified: msg("Unspecified"), in_range: msg("In range"), expired: msg("Expired"), not_yet_valid: msg("Not yet valid"),
  public: msg("Public"), normal: msg("Normal"), private: msg("Private"), highly_sensitive: msg("Highly sensitive"),
  clear_self_report: msg("Clear self-report"), inference: msg("Inference"), ambiguous: msg("Ambiguous"), conflicting: msg("Conflicting"),
  subject: msg("Subject"), participant: msg("Participant"), mentioned: msg("Mentioned"), place: msg("Place"), project: msg("Project"), organization: msg("Organization"),
  form: msg("Kind"), knowledge: msg("Knowledge"), adoption: msg("Adoption"), attention: msg("Attention"), entity: msg("Entity"),
  backfill: msg("Backfill"), live: msg("Live"),
  lexical: msg("Matched words"), alias: msg("Matched an alias"), conditions: msg("Conditions"), time_window: msg("Time window"), fresh: msg("Recent"), historical_rescue: msg("Kept from history"),
  not_adopted: msg("Not adopted"), validity: msg("Validity"), no_cue: msg("No cue match"), budget: msg("Byte budget"),
  material_captured: msg("Material captured"), formation: msg("Formation"), reevaluation: msg("Re-evaluation"), synthesis: msg("Synthesis"),
  correction: msg("Correction"), reversion: msg("Reversion"), state_change: msg("State change"),
  derived_from: msg("Derived from"), same_conversation: msg("Same conversation"), same_entity: msg("Same entity"), theme_cooccurrence: msg("Theme co-occurrence"),
  recorded_relation: msg("Recorded relation"), algorithm_suggestion: msg("Algorithm suggestion"),
});
export const word = (value: string | null | undefined): string => value == null ? "—" : WORDS[value] ?? value;
/** Memory ADR-MEM-157: memories ChatGPT distilled through the connector carry this prompt version. */
export const CHATGPT_PROMPT = "chatgpt-connector-authored-1";
export function analystText(reason: { prompt_version: string; model_version: string | null } | undefined | null): string | null {
  if (reason?.prompt_version !== CHATGPT_PROMPT) return null;
  return reason.model_version ? t("Extracted by ChatGPT · {model}", { model: reason.model_version }) : t("Extracted by ChatGPT");
}

const PRECISION: Record<string, Intl.DateTimeFormatOptions> = {
  instant: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  minute: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  hour: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23" },
  day: { year: "numeric", month: "short", day: "numeric" },
  month: { year: "numeric", month: "long" },
  year: { year: "numeric" },
};
/** A record time in the precision Core recorded. Unknown is never drawn as a date. */
export function recordTimeText(time: RecordTime | undefined | null): string {
  if (!time || time.precision === "unknown" || !time.from) return t("Time not recorded");
  const options = PRECISION[time.precision] ?? PRECISION.instant;
  const from = nativeDate(Date.parse(time.from), options);
  if (time.bound === "span" && time.until) return `${from} – ${nativeDate(Date.parse(time.until), options)}`;
  return time.basis === "inferred" ? t("{date} (inferred)", { date: from }) : from;
}
