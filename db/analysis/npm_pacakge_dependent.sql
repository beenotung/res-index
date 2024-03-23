select id, name, desc, weekly_downloads, datetime(last_publish_time/1000,'unixepoch') as last_publish from npm_package
where id in (
	select package_id from npm_package_dependency
	where dependency_id = (
		select id from npm_package
		where name = 'compress-json'
	)
)
or name = 'compress-json'
order by weekly_downloads desc
