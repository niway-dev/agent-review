import json,glob,collections
bugs=[];skipped=[]
for f in sorted(glob.glob('/tmp/kaipu-mine/agents/*.json')):
    d=json.load(open(f)); src=f.split('/')[-1][:-5]
    for b in d.get('bugs',[]):
        if src=='D2-mid-hidden' and b['id'] in ('cursor-track-tail-cut-floors-duration','quit-leaves-ghost-process-prewarm'): continue  # duplicates of D1/C records
        b['_src']=src; bugs.append(b)
    for s in d.get('skipped',[]): s['_src']=src; skipped.append(s)
def L(x): return ', '.join('#%s'%i for i in (x or [])) or '?'
def model(s): return (s or '?').replace('|','/')
bugs.sort(key=lambda b:(-int(b.get('difficulty') or 0),b['fix_prs'][0] if b.get('fix_prs') else 0))
o=['# kaipu-record bug catalogue (code-review benchmark candidates)','',
 'Source: niway-dev/kaipu-record main at clone time (2026-10-30). Read-only mining. SZZ = git blame of the lines each fix removed/changed, on the fix\'s parent; commit->PR mapped from local merge history.','',
 f'Total bugs: {len(bugs)}. Skipped PRs/items: {len(skipped)}.','',
 'Notes: (1) The AI reviewer (github-actions[bot], claude-review/agent-review markers) started on 2026-10-20 (~PR #301); every introducing PR merged earlier is `did-not-run`. (2) Two duplicates removed during merge (cursor-track tail cut #143, ghost process #422/#423 share fix commits). (3) Related chains: #143 (Fable 5.1 fix) introduced REC-B8 fixed in #416; #395 and #413 each fixed half of the cursor-tracker-after-end leak; #255 introduced the activation-policy cache bug fixed in #366; #367 hardening is followed by #439. (4) #303 (docs title) and #244 hold stacked code: replay #306 / #245 instead where the record says so. (5) found_by values marked Owner/user come from PR bodies; Linear tickets were not readable.','']
o+=['| # | id | audit | fix PR | intro PR | conf | class | diff | intro size (files,+/-) | visible in intro diff | found by | fixed by | Fable found/fixed | prior reviewer |','|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
for i,b in enumerate(bugs,1):
    s=b.get('intro_pr_size') or {}
    o.append(f"| {i} | {b['id']} | {b.get('audit_id') or ''} | {L(b.get('fix_prs'))} | {L(b.get('intro_prs'))} | {b.get('szz_confidence','?')}{' (omission)' if b.get('omission') else ''} | {b.get('class')} | {b.get('difficulty')} | {s.get('files','?')},+{s.get('add','?')}/-{s.get('del','?')} | {b.get('visible_from_diff','?')} | {model(b.get('found_by'))} | {model(b.get('fixed_by'))} | {str(b.get('fable_found'))[0]}/{str(b.get('fable_fixed'))[0]} | {b.get('prior_reviewer')} |")
o+=['','## Details','']
for i,b in enumerate(bugs,1):
    o+=[f"### {i}. {b['id']}"+(f" ({b['audit_id']})" if b.get('audit_id') else ''),'',
        f"- **Defect:** {b.get('description')}",f"- **User-visible failure:** {b.get('user_visible')}",
        f"- **Fix:** PR {L(b.get('fix_prs'))}; commits {', '.join(c[:9] for c in b.get('fix_commits') or [])}",
        f"- **Class:** {b.get('class')}",
        f"- **Introduced by:** PR {L(b.get('intro_prs'))}; commits {', '.join(c[:9] for c in b.get('intro_commits') or [])}; confidence {b.get('szz_confidence')}; omission: {b.get('omission')}. {b.get('szz_note','')}",
        f"- **Replayability:** intro PR size {b.get('intro_pr_size')}; mixed: {b.get('intro_pr_mixed')}; visible from diff: {b.get('visible_from_diff')}. {b.get('replay_note','')}",
        f"- **Difficulty:** {b.get('difficulty')}/5. {b.get('difficulty_reason')}",
        f"- **Found by:** {b.get('found_by')}. **Fixed by:** {b.get('fixed_by')}. Fable found: {b.get('fable_found')}; Fable fixed: {b.get('fable_fixed')}.",
        f"- **Prior AI reviewer on intro PR:** {b.get('prior_reviewer')}. {b.get('prior_reviewer_note','')}",'']
o+=['## Skipped','']+[f"- #{s.get('pr')}: {s.get('reason')}" for s in skipped]
open('/tmp/kaipu-mine/kaipu-bugs.md','w').write('\n'.join(o)+'\n')
c=collections.Counter(b.get('class') for b in bugs); dd=collections.Counter(b.get('difficulty') for b in bugs)
print(len(bugs),dict(c),dict(sorted(dd.items())))
print('fable found',sum(1 for b in bugs if b.get('fable_found') is True),'fable fixed',sum(1 for b in bugs if b.get('fable_fixed') is True))
print('reviewer',collections.Counter(b.get('prior_reviewer') for b in bugs))
