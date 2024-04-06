import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  for (;;) {
    let rows = await knex.raw(/* sql */ `
select max(id) as id from npm_package_dependency
group by package_id, dependency_id
having count(*) > 1
`)
    if (rows.length == 0) {
      break
    }
    for (let row of rows) {
      await knex.raw(
        /* sql */ `
delete from npm_package_dependency
where id = ?
`,
        [row.id],
      )
    }
  }
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.unique(['package_id', 'dependency_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.dropUnique(['package_id', 'dependency_id'])
  })
}
