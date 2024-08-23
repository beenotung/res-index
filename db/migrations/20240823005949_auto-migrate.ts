import { Knex } from 'knex'
import { startTimer } from '@beenotung/tslib/timer'
import { createHash } from 'crypto'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `page` add column `payload_hash` text null')
  let timer = startTimer('scan payload list')
  let rows = await knex.raw('select id from page where payload is not null')
  timer.setEstimateProgress(rows.length)
  for (let { id } of rows) {
    let [{ payload }] = await knex.raw('select payload from page where id = :id', { id })
    let hash = createHash('sha256')
    hash.write(payload)
    let digest = hash.digest().toString('hex')
    await knex.raw('update page set payload_hash = :digest, payload = null where id = :id', { id, digest })
    timer.tick()
  }
  timer.end()
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw("update page set payload = '{}' where payload_hash is not null")
  await knex.raw('alter table `page` drop column `payload_hash`')
}
