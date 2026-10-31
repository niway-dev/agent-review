import json,sys
n=sys.argv[1]; mx=int(sys.argv[2]) if len(sys.argv)>2 else 350
for k in 'cri':
    try: d=json.load(open(f'/tmp/kaipu-mine/rev/{n}.{k}.json'))
    except Exception as e: print(k,'missing'); continue
    print('==',n,k,len(d))
    for x in d:
        b=(x.get('body') or '').replace('\n',' ')
        u=(x.get('user') or {}).get('login') if isinstance(x.get('user'),dict) else x.get('author',{}).get('login') if isinstance(x.get('author'),dict) else x.get('user')
        print('-',u,x.get('path',''),x.get('line',x.get('original_line','')),b[:mx])
