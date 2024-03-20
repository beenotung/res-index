import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `npm_package` drop column `pull_requests`')
  await knex.raw('alter table `npm_package` drop column `issues`')
  {
    const rows = await knex.select('id', 'version').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `version`')
    await knex.raw("alter table `npm_package` add column `version` text null")
    for (let row of rows) {
      await knex('npm_package').update({ version: row.version }).where({ id: row.id })
    }
  }
  {
    const rows = await knex.select('id', 'homepage').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `homepage`')
    await knex.raw("alter table `npm_package` add column `homepage` text null")
    for (let row of rows) {
      await knex('npm_package').update({ homepage: row.homepage }).where({ id: row.id })
    }
  }

  if (!(await knex.schema.hasTable('npm_package_keyword'))) {
    await knex.schema.createTable('npm_package_keyword', table => {
      table.increments('id')
      table.integer('tag_id').unsigned().notNullable().references('tag.id')
      table.integer('npm_package_id').unsigned().notNullable().references('npm_package.id')
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('npm_package_dependency'))) {
    await knex.schema.createTable('npm_package_dependency', table => {
      table.increments('id')
      table.integer('package_id').unsigned().notNullable().references('npm_package.id')
      table.text('name').notNullable()
      table.integer('dependency_id').unsigned().nullable().references('npm_package.id')
      table.enum('type', ['prod', 'dev', 'peer']).notNullable()
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('npm_package_dependency')
  await knex.schema.dropTableIfExists('npm_package_keyword')
  // FIXME: alter column (npm_package.homepage) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
  // FIXME: alter column (npm_package.version) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
  await knex.raw('alter table `npm_package` add column `issues` integer null')
  await knex.raw('alter table `npm_package` add column `pull_requests` integer null')
}
