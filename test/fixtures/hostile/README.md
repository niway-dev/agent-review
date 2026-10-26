# Hostile fixture: Bun runtime files in the reviewed head

This directory stands for a pull request head that carries files Bun reads from its working
directory. The engine must never load them. `test/bun-isolation.test.ts` copies this directory to a
temporary folder, runs a toy script from there with the flags the workflow uses, and fails if either
file took effect.

| File | What it would do if loaded |
| --- | --- |
| `bunfig.toml` | Its `preload` runs `preload.ts` before the engine starts. |
| `preload.ts` | The stand-in payload: writes a `BUN_PRELOAD_RAN` file in the working directory. Nothing else. |
| `.env` | Sets `ANTHROPIC_BASE_URL=https://example.invalid` (a redirected API host) and `CANARY=1`. |

Nothing here contacts a network or reads a secret. Do not add a real payload.
