# Enouia Runtime repository guidance

Architecture v0.3 and the ADR register define the current implementation boundaries. A later ADR changes behavior only after its stated activation gates pass. Keep Activity & Usage independent of Memory/Context, and keep the Runtime build independent of the Moriium checkout and private credentials.

Current user scope (2026-10-04, latest update): implement the frontend from the completed Claude Design Quiet Runtime delivery. The user has explicitly authorized frontend work, superseding the earlier backend-only restriction. Implement the seven surfaces and Windows shell while preserving the existing backend boundaries. Display fictional demo data explicitly until real handlers are available; frontend state must not impersonate canonical backend commits or control the installed Activity scheduler. A frontend implementation request does not itself authorize Vault persistence implementation, personal migration or production activation.

The user explicitly requested continuous work across backend design slices. Verify, commit and push each completed slice, then proceed to the next backend design boundary without stopping for a routine continuation prompt. This supersedes earlier per-milestone stopping preferences within the current design scope.

When Codex materially contributes to a commit in this repository, include this exact trailer after a blank line in the commit message:

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

This trailer identifies the public GitHub `codex` account. Do not add it when Codex did not contribute. Preserve other contributors' changes and use the checks appropriate to the changed files before reporting completion.
