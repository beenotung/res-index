import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  // alter column (npm_package.dependent_page_id) to be non-nullable
  
  let deps = await knex.select('*').from('npm_package_dependency')
  let keywords = await knex.select('*').from('npm_package_keyword')
  let packages = await knex.select('*').from('npm_package')

  await knex.schema.dropTable('npm_package_dependency')
  await knex.schema.dropTable('npm_package_keyword')
  await knex.schema.dropTable('npm_package')
  
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
  await knex.schema.createTable('npm_package_keyword', table => {
    table.increments('id')
    table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
    table.integer('npm_package_id').unsigned().notNullable().references('npm_package.id')
    table.timestamps(false, true)
  })
  await knex.schema.createTable('npm_package_dependency', table => {
    table.increments('id')
    table.integer('package_id').unsigned().notNullable().references('npm_package.id')
    table.integer('dependency_id').unsigned().notNullable().references('npm_package.id')
    table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
    table.timestamps(false, true)
  })

  async function getPageId(url: string): Promise<number> {
    let row = await knex.select('id').from('page').where({ url }).first()
    if (row) return row.id
    let [id] = await knex('page').insert({ 
      url,
      payload: null,
      check_time: null,
      update_time: null
    })
    return id
  }
 
  for (let row of packages){
    let dependent_page_url = `https://www.npmjs.com/browse/depended/${row.name}?offset=0`
    if (!row.dependent_page_id) {
      row.dependent_page_id = await getPageId(dependent_page_url)
    }
    await knex.insert(row).into('npm_package')
  }
  for (let row of deps){
    await knex.insert(row).into('npm_package_dependency')
  }
  for (let row of keywords){
    await knex.insert(row).into('npm_package_keyword')
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  let deps = await knex.select('*').from('npm_package_dependency')
  let keywords = await knex.select('*').from('npm_package_keyword')
  let packages = await knex.select('*').from('npm_package')

  await knex.schema.dropTable('npm_package_dependency')
  await knex.schema.dropTable('npm_package_keyword')
  await knex.schema.dropTable('npm_package')
  
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
    table.integer('dependent_page_id').unsigned().nullable().references('page.id')
    table.timestamps(false, true)
  })
  await knex.schema.createTable('npm_package_keyword', table => {
    table.increments('id')
    table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
    table.integer('npm_package_id').unsigned().notNullable().references('npm_package.id')
    table.timestamps(false, true)
  })
  await knex.schema.createTable('npm_package_dependency', table => {
    table.increments('id')
    table.integer('package_id').unsigned().notNullable().references('npm_package.id')
    table.integer('dependency_id').unsigned().notNullable().references('npm_package.id')
    table.enum('type', ['prod', 'dev', 'peer', 'optional']).notNullable()
    table.timestamps(false, true)
  })

  for (let row of packages){
    await knex.insert(row).into('npm_package')
  }
  for (let row of deps){
    await knex.insert(row).into('npm_package_dependency')
  }
  for (let row of keywords){
    await knex.insert(row).into('npm_package_keyword')
  }
}
