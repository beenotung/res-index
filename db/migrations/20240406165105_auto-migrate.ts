import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  {
    // alter column (repo.domain_id) to be non-nullable

    let repo_rows = await knex.select('*').from('repo')
    let repo_keyword_rows = await knex.select('*').from('repo_keyword')
    let npm_package_rows = await knex.select('*').from('npm_package')
    let npm_package_keyword_rows = await knex.select('*').from('npm_package_keyword')
    let npm_package_dependency_rows = await knex.select('*').from('npm_package_dependency')

    await knex.schema.dropTable('npm_package_dependency')
    await knex.schema.dropTable('npm_package_keyword')
    await knex.schema.dropTable('npm_package')
    await knex.schema.dropTable('repo_keyword')
    await knex.schema.dropTable('repo')

    if (!(await knex.schema.hasTable('repo'))) {
      await knex.schema.createTable('repo', table => {
        table.increments('id')
        table.integer('domain_id').unsigned().notNullable().references('domain.id')
        table.integer('author_id').unsigned().notNullable().references('author.id')
        table.text('name').notNullable()
        table.boolean('is_fork').nullable()
        table.text('url').notNullable().unique()
        table.text('desc').nullable()
        table.integer('programming_language_id').unsigned().nullable().references('programming_language.id')
        table.text('website').nullable()
        table.integer('stars').nullable()
        table.integer('watchers').nullable()
        table.integer('forks').nullable()
        table.text('readme').nullable()
        table.integer('last_commit').nullable()
        table.integer('page_id').unsigned().notNullable().references('page.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('repo_keyword'))) {
      await knex.schema.createTable('repo_keyword', table => {
        table.increments('id')
        table.integer('repo_id').unsigned().notNullable().references('repo.id')
        table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package'))) {
      await knex.schema.createTable('npm_package', table => {
        table.increments('id')
        table.integer('author_id').unsigned().nullable().references('author.id')
        table.text('name').notNullable().unique()
        table.text('version').nullable()
        table.text('desc').nullable()
        table.integer('create_time').nullable()
        table.integer('last_publish_time').nullable()
        table.integer('unpublish_time').nullable()
        table.integer('weekly_downloads').nullable()
        table.integer('unpacked_size').nullable()
        table.integer('file_count').nullable()
        table.text('repository').nullable()
        table.integer('repo_id').unsigned().nullable().references('repo.id')
        table.text('homepage').nullable()
        table.text('readme').nullable()
        table.integer('page_id').unsigned().notNullable().references('page.id')
        table.integer('download_page_id').unsigned().notNullable().references('page.id')
        table.integer('dependent_page_id').unsigned().notNullable().references('page.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package_keyword'))) {
      await knex.schema.createTable('npm_package_keyword', table => {
        table.increments('id')
        table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
        table.integer('npm_package_id').unsigned().notNullable().references('npm_package.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package_dependency'))) {
      await knex.schema.createTable('npm_package_dependency', table => {
        table.increments('id')
        table.integer('package_id').unsigned().notNullable().references('npm_package.id')
        table.integer('dependency_id').unsigned().notNullable().references('npm_package.id')
        table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
        table.timestamps(false, true)
      })
    }

    for (let row of repo_rows) {
      await knex.insert(row).into('repo')
    }
    for (let row of repo_keyword_rows) {
      await knex.insert(row).into('repo_keyword')
    }
    for (let row of npm_package_rows) {
      await knex.insert(row).into('npm_package')
    }
    for (let row of npm_package_keyword_rows) {
      await knex.insert(row).into('npm_package_keyword')
    }
    for (let row of npm_package_dependency_rows) {
      await knex.insert(row).into('npm_package_dependency')
    }
  }
  
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  {
    // alter column (repo.domain_id) to be nullable

    let repo_rows = await knex.select('*').from('repo')
    let repo_keyword_rows = await knex.select('*').from('repo_keyword')
    let npm_package_rows = await knex.select('*').from('npm_package')
    let npm_package_keyword_rows = await knex.select('*').from('npm_package_keyword')
    let npm_package_dependency_rows = await knex.select('*').from('npm_package_dependency')

    await knex.schema.dropTable('npm_package_dependency')
    await knex.schema.dropTable('npm_package_keyword')
    await knex.schema.dropTable('npm_package')
    await knex.schema.dropTable('repo_keyword')
    await knex.schema.dropTable('repo')

    if (!(await knex.schema.hasTable('repo'))) {
      await knex.schema.createTable('repo', table => {
        table.increments('id')
        table.integer('domain_id').unsigned().nullable().references('domain.id')
        table.integer('author_id').unsigned().notNullable().references('author.id')
        table.text('name').notNullable()
        table.boolean('is_fork').nullable()
        table.text('url').notNullable().unique()
        table.text('desc').nullable()
        table.integer('programming_language_id').unsigned().nullable().references('programming_language.id')
        table.text('website').nullable()
        table.integer('stars').nullable()
        table.integer('watchers').nullable()
        table.integer('forks').nullable()
        table.text('readme').nullable()
        table.integer('last_commit').nullable()
        table.integer('page_id').unsigned().notNullable().references('page.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('repo_keyword'))) {
      await knex.schema.createTable('repo_keyword', table => {
        table.increments('id')
        table.integer('repo_id').unsigned().notNullable().references('repo.id')
        table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package'))) {
      await knex.schema.createTable('npm_package', table => {
        table.increments('id')
        table.integer('author_id').unsigned().nullable().references('author.id')
        table.text('name').notNullable().unique()
        table.text('version').nullable()
        table.text('desc').nullable()
        table.integer('create_time').nullable()
        table.integer('last_publish_time').nullable()
        table.integer('unpublish_time').nullable()
        table.integer('weekly_downloads').nullable()
        table.integer('unpacked_size').nullable()
        table.integer('file_count').nullable()
        table.text('repository').nullable()
        table.integer('repo_id').unsigned().nullable().references('repo.id')
        table.text('homepage').nullable()
        table.text('readme').nullable()
        table.integer('page_id').unsigned().notNullable().references('page.id')
        table.integer('download_page_id').unsigned().notNullable().references('page.id')
        table.integer('dependent_page_id').unsigned().notNullable().references('page.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package_keyword'))) {
      await knex.schema.createTable('npm_package_keyword', table => {
        table.increments('id')
        table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
        table.integer('npm_package_id').unsigned().notNullable().references('npm_package.id')
        table.timestamps(false, true)
      })
    }
    if (!(await knex.schema.hasTable('npm_package_dependency'))) {
      await knex.schema.createTable('npm_package_dependency', table => {
        table.increments('id')
        table.integer('package_id').unsigned().notNullable().references('npm_package.id')
        table.integer('dependency_id').unsigned().notNullable().references('npm_package.id')
        table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
        table.timestamps(false, true)
      })
    }

    for (let row of repo_rows) {
      await knex.insert(row).into('repo')
    }
    for (let row of repo_keyword_rows) {
      await knex.insert(row).into('repo_keyword')
    }
    for (let row of npm_package_rows) {
      await knex.insert(row).into('npm_package')
    }
    for (let row of npm_package_keyword_rows) {
      await knex.insert(row).into('npm_package_keyword')
    }
    for (let row of npm_package_dependency_rows) {
      await knex.insert(row).into('npm_package_dependency')
    }
  }
  
}
