select username, name, weekly_downloads
from npm_package
inner join author on author.id = npm_package.author_id
where username = 'beenotung'
order by weekly_downloads desc
