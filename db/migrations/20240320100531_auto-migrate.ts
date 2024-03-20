import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `npm_package` drop column `pull_requests`')
  await knex.raw('alter table `npm_package` drop column `issues`')
  await knex.raw('alter table `npm_package` drop column `total_files`')
  {
    const rows = await knex.select('id', 'unpacked_size').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `unpacked_size`')
    await knex.raw("alter table `npm_package` add column `unpacked_size` integer null")
    for (let row of rows) {
      await knex('npm_package').update({ unpacked_size: row.unpacked_size }).where({ id: row.id })
    }
  }
  await knex.raw('alter table `npm_package` add column `file_count` integer null')

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
      table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('npm_package_dependency')
  await knex.schema.dropTableIfExists('npm_package_keyword')
  await knex.raw('alter table `npm_package` drop column `file_count`')
  {
    const rows = await knex.select('id', 'unpacked_size').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `unpacked_size`')
    await knex.raw("alter table `npm_package` add column `unpacked_size` text null")
    for (let row of rows) {
      await knex('npm_package').update({ unpacked_size: row.unpacked_size }).where({ id: row.id })
    }
  }
  await knex.raw('alter table `npm_package` add column `total_files` integer null')
  await knex.raw('alter table `npm_package` add column `issues` integer null')
  await knex.raw('alter table `npm_package` add column `pull_requests` integer null')
}
