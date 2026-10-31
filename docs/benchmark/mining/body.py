import json,sys
d={p['number']:p for p in json.load(open('/tmp/kaipu-mine/prs.json'))}
L=int(sys.argv[1])
for n in sys.argv[2:]:
    p=d[int(n)]; print('=====',n,p['title'],f"files={p['changedFiles']} +{p['additions']}/-{p['deletions']}",p['mergedAt'][:10]); print((p['body'] or '')[:L])
