import json,subprocess,sys,re,collections
sys.path.insert(0,'/tmp/kaipu-mine/scripts')
from szz import szz,g,c2pr
prs={p['number']:p for p in json.load(open('/tmp/kaipu-mine/prs.json'))}
extra=[int(x) for x in sys.argv[1:]]
nums=sorted([n for n,p in prs.items() if p['state']=='MERGED' and p['title'].lower().startswith('fix')]+extra)
res={}
for n in nums:
    p=prs[n]; M=p['mergeCommit']['oid']
    par=g('rev-list','--parents','-n1',M).split()
    if len(par)<2: continue
    s,w,ps,pw,files=szz(par[1],M)
    commits=[par[0]]+(g('rev-list','--no-merges',f'{par[1]}..{par[2]}').split() if len(par)==3 else [])
    msgs=g('log','--no-walk','--format=%B%x00',*commits)
    trailers=sorted(set(re.findall(r'Co-Authored-By: ([^<\n]+)',msgs,re.I)))
    res[n]={'strong':ps.most_common(6),'weak':pw.most_common(4),'trailers':trailers,'ncommits':len(commits),'merge':len(par)==3,
            'body_models':sorted(set(m.lower() for m in re.findall(r'(?i)(fable|opus[ 0-9.]*|sonnet[ 0-9.]*|gpt-?[0-9.]*\w*|codex|sol\b|haiku)',(p['body'] or '')+msgs)))}
    print(n,res[n]['strong'][:3],res[n]['weak'][:2],trailers,flush=True)
json.dump(res,open('/tmp/kaipu-mine/szz_all.json','w'),indent=1)
