# ADR-044 — The registered entry runs its local Ollama

Date: 2026-11-27. Status: implemented; activated on merge after local verification. Builds on Memory ADR-MEM-220 (Runtime's bge-m3 semantic index).

Morii asked that Ollama start when Runtime opens and close when Runtime fully exits. Without it the semantic index reports unavailable and recall stays lexical until he starts Ollama by hand.

## Decision

When the registered library entry starts (explicit or remembered launch, not `--autostart`), Runtime checks `127.0.0.1:11434`. If something already answers, that Ollama is not Runtime's and is left alone, and Runtime never stops it. Otherwise Runtime starts `ollama serve` from `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` (or `ollama` on `PATH`) without a window, with the user's environment (so `OLLAMA_MODELS` still applies), inside a Windows job with kill-on-close. The job's only handle lives in Runtime's state, so Exit, the end of the Windows session or a crash all end the server and the model runners it started. If the job cannot be set up, the server is killed at once rather than left running. Workspace, synthetic and login-startup launches start nothing.

Ollama's own login-startup shortcut is Ollama's setting, not Runtime's; while it is on, Ollama is already running when Runtime opens and stays after Runtime exits.

## Verification

Debug build with isolated `APPDATA`/WebView2 profile and Ollama 0.40.18: with the port free, Runtime started `ollama.exe` as its child; an embed call started `llama-server.exe` under it (1024 dims); force-killing Runtime left no Ollama process and closed the port. With Ollama already running, Runtime started nothing, and Ollama kept running after Runtime was killed.
