with
  incomplete_page as (
    select page_id from npm_package where deprecated is null or has_types is null
    union
    select page_id from repo where is_public is null
)
, want_list as (
    select
      id
    from page
    where page.check_time is null
      or page.id in (select page_id from incomplete_page)
    order by page.id asc
)
select 'pending' as status, (select count(id) from page where id in (select id from want_list)) as count
union
select 'done' as status, (select count(id) from page where id not in (select id from want_list)) as count
