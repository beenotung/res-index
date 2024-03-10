select
  programming_language.name
, count(*) as count
from programming_language
inner join repo on repo.programming_language_id = programming_language.id
group by programming_language.id
order by count desc
