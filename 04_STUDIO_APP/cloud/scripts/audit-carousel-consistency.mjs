// Current regression entry point. Historical failing-case evidence remains in artifacts.
import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--import','tsx','--test','tests/carousel-consistency.test.ts','tests/request-generation.test.ts'],{stdio:'inherit'});
process.exitCode=r.status??1;
