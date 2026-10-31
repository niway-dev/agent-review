import json,subprocess
R='/tmp/kaipu-mine/repo'
def g(*a): return subprocess.run(['git','-C',R]+list(a),capture_output=True,text=True).stdout
prs=json.load(open('/tmp/kaipu-mine/prs.json'))
m=[p for p in prs if p['state']=='MERGED' and p.get('mergeCommit')]
m.sort(key=lambda p:p['mergedAt'])
c2pr={}
for p in m:
    M=p['mergeCommit']['oid']
    par=g('rev-list','--parents','-n1',M).split()
    if len(par)<2: continue  # not in local history
    shas=[M]
    if len(par)==3:
        shas+=g('rev-list',f'{par[1]}..{par[2]}').split()
    for s in shas: c2pr.setdefault(s,p['number'])
json.dump(c2pr,open('/tmp/kaipu-mine/c2pr.json','w'))
allc=g('rev-list','main').split()
print(len(c2pr),len(allc),sum(1 for c in allc if c not in c2pr))
