import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  // alter column (npm_package_dependency.dependency_id) to be non-nullable

  let rows = await knex.select('*').from('npm_package_dependency')

  await knex.schema.dropTable('npm_package_dependency')
  await knex.schema.createTable('npm_package_dependency', table => {
    table.increments('id')
    table.integer('package_id').unsigned().notNullable().references('npm_package.id')
    table.integer('dependency_id').unsigned().notNullable().references('npm_package.id')
    table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
    table.timestamps(false, true)
  })

  for (let row of rows) {
    await knex.insert(row).into('npm_package_dependency')
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  let rows = await knex.select('id', 'dependency_id').from('npm_package_dependency')
  await knex.schema.alterTable('npm_package_dependency', table => {
      table.dropColumn('dependency_id')
  })
  await knex.schema.alterTable('npm_package_dependency', table => {
      table.integer('dependency_id').unsigned().nullable().references('npm_package.id')
  })
  for (let row of rows){
    await knex('npm_package_dependency').update({ dependency_id: row.dependency_id }).where({ id: row.id })
  }
}
