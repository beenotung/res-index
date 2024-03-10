import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('page'))) {
    await knex.schema.createTable('page', table => {
      table.increments('id')
      table.text('url').notNullable().unique()
      table.integer('check_time').nullable()
      table.integer('update_time').nullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('programming_language'))) {
    await knex.schema.createTable('programming_language', table => {
      table.increments('id')
      table.text('name').notNullable().unique()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('repo'))) {
    await knex.schema.createTable('repo', table => {
      table.increments('id')
      table.text('url').notNullable()
      table.text('desc').nullable()
      table.integer('programming_language_id').unsigned().nullable().references('programming_language.id')
      table.integer('update_time').notNullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('tag'))) {
    await knex.schema.createTable('tag', table => {
      table.increments('id')
      table.text('name').notNullable().unique()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('repo_tag'))) {
    await knex.schema.createTable('repo_tag', table => {
      table.increments('id')
      table.integer('repo_id').unsigned().notNullable().references('repo.id')
      table.integer('tag_id').unsigned().notNullable().references('tag.id')
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('repo_tag')
  await knex.schema.dropTableIfExists('tag')
  await knex.schema.dropTableIfExists('repo')
  await knex.schema.dropTableIfExists('programming_language')
  await knex.schema.dropTableIfExists('page')
}
