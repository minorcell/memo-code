import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.env.MEMO_HOME) {
    process.env.MEMO_HOME = mkdtempSync(join(tmpdir(), 'memo-test-'))
}
