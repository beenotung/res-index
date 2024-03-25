import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  {
    const rows = await knex.select('id', 'is_fork').from('repo')
    await knex.raw('alter table `repo` drop column `is_fork`')
    await knex.raw("alter table `repo` add column `is_fork` boolean null")
    for (let row of rows) {
      await knex('repo').update({ is_fork: row.is_fork }).where({ id: row.id })
    }
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  // FIXME: alter column (repo.is_fork) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
}
