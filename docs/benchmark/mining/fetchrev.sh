#!/bin/bash
n=$1; o=/tmp/kaipu-mine/rev
[ -s $o/$n.c.json ] || gh api --paginate repos/niway-dev/kaipu-record/pulls/$n/comments > $o/$n.c.json 2>/dev/null
[ -s $o/$n.r.json ] || gh api --paginate repos/niway-dev/kaipu-record/pulls/$n/reviews > $o/$n.r.json 2>/dev/null
[ -s $o/$n.i.json ] || gh api --paginate repos/niway-dev/kaipu-record/issues/$n/comments > $o/$n.i.json 2>/dev/null
