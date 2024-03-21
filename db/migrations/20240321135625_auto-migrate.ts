import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  // FIXME: alter column (npm_package_dependency.dependency_id) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  {
    const rows = await knex.select('id', 'dependency_id').from('npm_package_dependency')
    await knex.schema.alterTable('npm_package_dependency', table => table.dropForeign(['dependency_id']))
    await knex.raw('alter table `npm_package_dependency` drop column `dependency_id`')
    await knex.raw("alter table `npm_package_dependency` add column `dependency_id` integer null references npm_package(id)")
    for (let row of rows) {
      await knex('npm_package_dependency').update({ dependency_id: row.dependency_id }).where({ id: row.id })
    }
  }
}
