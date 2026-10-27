# Measuring precision

A change to the prompt rules has to show that it lowers false positives without hiding real
findings. The only ground truth is the owner's judgement of each finding, so the owner writes it
down in the finding's thread, and a script counts it.

## The verdict convention

Reply in the finding's own thread with a first sentence that starts with `Verdict:`:

| Reply starts with | Counted as |
| --- | --- |
| `Verdict: correct` | correct |
| `Verdict: wrong`, `Verdict: incorrect`, or `false positive` | wrong |
| `Verdict: partially wrong`, or a sentence that says both "correct" and "wrong" | partly correct |

Only the verdict's own sentence is read, up to the first period or closing `**`, so the
explanation after it can say anything. Bold is fine: `**Verdict: wrong (false positive).**`.
A finding without a verdict reply is counted as unjudged, never as correct. A reply by the
reviewer itself is never read as a verdict.

## Running it

```sh
bun src/precision.ts niway-dev/kaipu-record niway-dev/gymtrack-monorepo --prs 50
```

It only reads GitHub through `gh`, so it needs a `gh` login that can read the repositories. It
prints one table per severity, topic and model, with precision computed as correct over judged
and a partly correct finding counted as half: it found something real and also asked for
something wrong. Labels from before v1.1.0 (`Should fix`, `Note`) are counted under their old
names.

## Reading the numbers

Compare the same repositories before and after a prompt change, over a similar number of judged
findings. The tables are small samples: one wrong finding moves a group of ten by ten points.
Precision by severity is the one that matters most: a wrong `fix` or `blocker` costs the author
the most time, because it is stated as fact. This is also the measurement behind the reopen
condition of ADR 0003.
