#!/bin/bash
set -e
set -o pipefail

cd data
sqlite3 db.sqlite3 '.backup slim.sqlite3'
sqlite3 slim.sqlite3 'update page set payload = null'
sqlite3 slim.sqlite3 '.dump' > slim.sql
cat slim.sql | xz - > db.sql.xz
ls -lh db.sql.xz
