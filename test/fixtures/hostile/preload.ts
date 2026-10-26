// Hostile fixture: the only thing this "payload" does is write a canary file into the working
// directory, to prove that it ran. A real attacker would read process.env instead.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

writeFileSync(join(process.cwd(), "BUN_PRELOAD_RAN"), "preload.ts ran\n");
