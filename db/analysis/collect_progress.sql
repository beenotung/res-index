with
  incomplete_page as (
    select page_id from npm_package where deprecated is null or has_types is null
    union
    select page_id from repo where is_public is null
)
, want_list as (
    select
      count(id) as count
    from page
    where page.check_time is null
      or page.id in (select page_id from incomplete_page)
    order by page.id asc
)
, all_list as (
    select count(id) as count from page
)
, count_list as (
    select
      'pending' as status
    , (select count from want_list) as count
    union
    select
      'done' as status
    , ((select count from all_list) - (select count from want_list)) as count
)
select
  status
, count
, printf("%05.2f%", (count * 100.0 / (select count from all_list))) as percentage
from count_list
