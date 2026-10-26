// Drop-in explicit selection over already loaded task snapshots. No task discovery or Provider port.
import { useId, useState } from "react";
import { call, type J } from "./client";
import { historyTaskObservation } from "./historyTasks";
import { type ComparisonChoice } from "./historyComparison";
import { HistoryComparisonPanel } from "./HistoryComparisonPanel";

import { t } from '../i18n/index.ts';
export function HistoryComparisonSelection({ vaultId, tasks, enabled, request = call }: {
  vaultId: string; tasks: readonly J[]; enabled: boolean; request?: typeof call;
}) {
  if (!enabled) return null;
  try {
    if (!Array.isArray(tasks) || new Set(tasks.map(task => task.taskId)).size !== tasks.length) throw Error("tasks");
    for (const task of tasks) historyTaskObservation(task, { vaultId });
  } catch {
    return <p className="mem-error" role="alert">{t("Read current-Vault task details before choosing saved batches.")}</p>;
  }
  return <LoadedSelection key={JSON.stringify([vaultId, tasks])} vaultId={vaultId} tasks={tasks} request={request}/>;
}
function LoadedSelection({ vaultId, tasks, request }: {
  vaultId: string; tasks: readonly J[]; request: typeof call;
}) {
  const fieldId = useId();
  const [observed] = useState(() => structuredClone(tasks));
  const [choices, setChoices] = useState<ComparisonChoice[]>([]);
  const available = (batch: J) => batch.invocationState === "completed"
    && ["ready", "paused", "completed"].includes(batch.state);
  const readyCount = observed.reduce((count, task) => count + task.batches.filter(available).length, 0);
  function choose(task: J, batchIndex: number, checked: boolean) {
    setChoices(previous => {
      const present = previous.some(choice => choice.task.taskId === task.taskId && choice.batchIndex === batchIndex);
      if (!checked) return previous.filter(choice => choice.task.taskId !== task.taskId || choice.batchIndex !== batchIndex);
      if (present || previous.length === 32 || !task.batches.some((batch: J) => batch.batchIndex === batchIndex && available(batch))) return previous;
      return [...previous, { task, batchIndex }];
    });
  }
  return <section className="mem-stack" aria-label={t("Saved batch comparison selection")}>
    <h3 className="mem-h3">{t("Choose saved batches for review")}</h3>
    <p id={fieldId + "-help"} className="mem-muted">{t("Choose from the loaded task snapshots, then read the comparison explicitly. A new task snapshot or changed selection clears the old comparison. No batch is created, resumed or sent.")}</p>
    <p className="mem-muted">Selected {choices.length}/32 saved batches · {readyCount} available in these loaded tasks</p>
    {observed.length === 0 && <p>{t("Read saved task details first.")}</p>}
    {observed.length > 0 && readyCount === 0 && <p>{t("No saved completed responses are available in these task snapshots.")}</p>}
    {observed.map(task => <details className="mem-card" key={task.taskId}>
      <summary>{t("Task {task} · {ready}/{all} saved responses available", { task: task.taskId, ready: task.batches.filter(available).length, all: task.batches.length })}</summary>
      <fieldset className="mem-stack"><legend>{t("Saved batches in this task")}</legend>
        {task.batches.map((batch: J) => {
          const checked = choices.some(choice => choice.task.taskId === task.taskId && choice.batchIndex === batch.batchIndex);
          return <div className="mem-stack" key={batch.batchIndex}>
            <label className="mem-label"><input type="checkbox" checked={checked} aria-describedby={fieldId + "-help"}
              disabled={!available(batch) || choices.length === 32 && !checked}
              onChange={event => choose(task, batch.batchIndex, event.target.checked)}/>
              {" "}{t("Batch {n} · job {job} · response {response}", { n: batch.batchIndex + 1, job: batch.state, response: batch.invocationState ?? t("not observed") })}
            </label>
            {!available(batch) && <p className="mem-muted">{t("A saved completed response is required. Read the task again after its separate processing finishes.")}</p>}
          </div>;
        })}
      </fieldset>
    </details>)}
    {choices.length > 0 && <div><button type="button" className="mem-button" onClick={() => setChoices([])}>{t("Clear saved batch selection")}</button></div>}
    {choices.length > 0 && <HistoryComparisonPanel vaultId={vaultId} choices={choices} enabled request={request}/>}
  </section>;
}
