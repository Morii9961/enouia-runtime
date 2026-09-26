# Enouia Runtime repository guidance

Architecture v0.3 and the ADR register define the current implementation boundaries. A later ADR changes behavior only after its stated activation gates pass. Keep Activity & Usage independent of Memory/Context, and keep the Runtime build independent of the Moriium checkout and private credentials.

When Codex materially contributes to a commit in this repository, include this exact trailer after a blank line in the commit message:

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

This trailer identifies the public GitHub `codex` account. Do not add it when Codex did not contribute. Preserve other contributors' changes and use the checks appropriate to the changed files before reporting completion.
