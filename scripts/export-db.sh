#!/bin/bash
set -e
set -o pipefail

cd data
while [ -f db.sqlite3-wal ]; do
  echo 'flushing wal file...'
  sqlite3 db.sqlite3 ".schema" > /dev/null
  if [ -f db.sqlite3-wal ]; then
    sleep 2
  fi
done
du -sh db.sqlite3
cp db.sqlite3 slim.sqlite3
while [ true ]; do
  count=$(sqlite3 slim.sqlite3 'select count(*) from page where payload is not null')
  echo -en "\r  pages to be clear: $count     "
  if [ $count == 0 ]; then
    echo ""
    break
  fi
  sqlite3 slim.sqlite3 'update page set payload = null where id in (select id from page where payload is not null limit 2000)'
done
sqlite3 slim.sqlite3 '.dump' > slim.sql
du -sh slim.sql
cat slim.sql | xz - > db.sql.xz
du -sh db.sql.xz
