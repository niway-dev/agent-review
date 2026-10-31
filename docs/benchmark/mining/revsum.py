import json,sys,os
for n in sys.argv[1:]:
    print("=== PR",n)
    for k in 'cri':
        f=f'/tmp/kaipu-mine/rev/{n}.{k}.json'
        if not os.path.exists(f): print(" no cache",k);continue
        try:d=json.load(open(f))
        except Exception as e: print(" bad",k);continue
        for c in d:
            u=c['user']['login']
            b=(c.get('body') or '')
            print(f" [{k}] {u} {c.get('path','')}:{c.get('line','')} {b[:260]!r}")
