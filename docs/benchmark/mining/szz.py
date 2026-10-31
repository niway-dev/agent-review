import json,subprocess,sys,re,collections
R='/tmp/kaipu-mine/repo'
def g(*a): return subprocess.run(['git','-C',R]+list(a),capture_output=True,text=True).stdout
c2pr={k:v for k,v in json.load(open('/tmp/kaipu-mine/c2pr.json')).items()}
prs={p['number']:p for p in json.load(open('/tmp/kaipu-mine/prs.json'))}
SKIP=re.compile(r'(\.test\.|\.spec\.|/e2e/|__tests__|apps/documentation/|\.md$|\.mdx$|CHANGELOG|bun\.lock|\.snap$|fixture|/docs/|\.json$)')
def ranges(base,head,paths=None):
    args=['diff','-U0','--no-renames',base,head]
    if paths: args+=['--']+paths
    d=g(*args); out=collections.defaultdict(list); f=None
    for l in d.splitlines():
        if l.startswith('--- '): f=l[6:] if l.startswith('--- a/') else None
        m=re.match(r'@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@',l)
        if m and f:
            s=int(m.group(1)); n=int(m.group(2) if m.group(2) is not None else 1)
            out[f].append((s,n))
    return out
def blame(base,f,a,b):
    o=g('blame','-w','--line-porcelain',f'-L{a},{b}',base,'--',f)
    return [l.split()[0] for l in o.splitlines() if re.match(r'^[0-9a-f]{40} ',l)]
def szz(base,head,paths=None):
    strong=collections.Counter(); weak=collections.Counter(); files=collections.defaultdict(collections.Counter)
    for f,rs in ranges(base,head,paths).items():
        if SKIP.search(f): continue
        for s,n in rs:
            if n>0:
                for c in blame(base,f,s,s+n-1): strong[c]+=1; files[c][f]+=1
            else:
                a=max(1,s); 
                for c in blame(base,f,a,a+1): weak[c]+=1; files[c][f]+=1
    def agg(cnt):
        p=collections.Counter()
        for c,n in cnt.items(): p[c2pr.get(c,'?'+c[:8])]+=n
        return p
    return strong,weak,agg(strong),agg(weak),files
if __name__=='__main__':
    base,head=sys.argv[1],sys.argv[2]; paths=sys.argv[3:] or None
    s,w,ps,pw,files=szz(base,head,paths)
    print('STRONG(removed lines) by PR:',ps.most_common(8))
    print('WEAK(context of pure adds) by PR:',pw.most_common(5))
    for c,n in (s+w).most_common(8):
        print(' ',c[:9],n,c2pr.get(c),g('log','-1','--format=%ad %s','--date=short',c).strip()[:100],dict(files[c].most_common(3)))
