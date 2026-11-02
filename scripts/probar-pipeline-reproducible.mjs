// Runner local/CI: necesita Python 3 en PATH o RADAR_PYTHON; nunca descarga ni publica.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../test/pipeline-fase2.test.mjs',import.meta.url))],{
 env:{...process.env,RADAR_REQUIRE_E2E:'1'},stdio:'inherit'
});
process.exitCode=result.status??1;
