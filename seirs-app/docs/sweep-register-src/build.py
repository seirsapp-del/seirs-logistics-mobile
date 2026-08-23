# -*- coding: utf-8 -*-
"""Build the sweep register: one artifact page + one markdown file in the repo.

Single source of truth is the five per-app modules. Every finding appears
individually so nothing can be quietly skipped.
"""
import io, os, sys, html, importlib.util, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
MODULES = ['customer', 'driver', 'business', 'admin', 'website']
COLOR = {'customer': 'var(--a)', 'driver': 'var(--b)', 'business': 'var(--e)',
         'admin': 'var(--d)', 'website': 'var(--c)'}

def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

apps = [load(n) for n in MODULES]

# ── counts ────────────────────────────────────────────────────────────────
def tally(fs):
    t = {}
    for sev in ('HIGH', 'MEDIUM', 'LOW'):
        found = [f for f in fs if f['sev'] == sev]
        # decisions are open work, but they are blocked on the founder
        closed = [f for f in found if f['status'] == 'closed']
        t[sev] = (len(found), len(closed))
    return t

grand = {'HIGH': [0, 0], 'MEDIUM': [0, 0], 'LOW': [0, 0]}
for a in apps:
    for sev, (f, c) in tally(a.FINDINGS).items():
        grand[sev][0] += f; grand[sev][1] += c

total_found  = sum(v[0] for v in grand.values())
total_closed = sum(v[1] for v in grand.values())
device_found = sum(1 for a in apps for f in a.FINDINGS if f.get('device'))
decisions    = [f for a in apps for f in a.FINDINGS if f['status'] == 'decision']
pct = round(total_closed * 100.0 / total_found, 1) if total_found else 0

e = lambda s: html.escape(str(s or ''))
STAMP = datetime.date(2026, 8, 23).strftime('%d %B %Y')

# ── markdown for the repo ────────────────────────────────────────────────
md = []
md.append('# SEIRS sweep and audit register\n')
md.append('Generated %s from the device sweep and the five per-surface code audits.\n' % STAMP)
md.append('This file is generated. Edit `scratchpad/reg/*.py` and re-run `build.py`.\n')
md.append('\n## Totals\n')
md.append('| Severity | Found | Closed | Open |\n|---|---:|---:|---:|\n')
for sev in ('HIGH', 'MEDIUM', 'LOW'):
    f, c = grand[sev]
    md.append('| %s | %d | %d | %d |\n' % (sev, f, c, f - c))
md.append('| **Total** | **%d** | **%d** | **%d** |\n' % (total_found, total_closed, total_found - total_closed))
md.append('\n%d of these were found by driving the phone, not by reading code.\n' % device_found)
md.append('%d are blocked on a founder decision.\n' % len(decisions))

for a in apps:
    t = tally(a.FINDINGS)
    md.append('\n---\n\n## %s\n\n' % a.APP)
    md.append('HIGH %d/%d closed · MEDIUM %d/%d · LOW %d/%d\n\n'
              % (t['HIGH'][1], t['HIGH'][0], t['MEDIUM'][1], t['MEDIUM'][0], t['LOW'][1], t['LOW'][0]))
    for sev in ('HIGH', 'MEDIUM', 'LOW'):
        rows = [f for f in a.FINDINGS if f['sev'] == sev]
        if not rows: continue
        md.append('\n### %s\n\n' % sev)
        for f in rows:
            mark = {'closed': 'x', 'open': ' ', 'decision': '~'}[f['status']]
            md.append('- [%s] **%s %s**  \n' % (mark, f['id'], f['title']))
            md.append('  `%s`  \n' % f['loc'])
            if f.get('detail'): md.append('  %s  \n' % f['detail'])
            md.append('  *Fix:* %s\n' % f['fix'])

REPO = r'c:\FlutterProjects\seirs-app\docs'
os.makedirs(REPO, exist_ok=True)
io.open(os.path.join(REPO, 'SWEEP-REGISTER-2026-08-23.md'), 'w', encoding='utf-8', newline='\n').write(''.join(md))
print('repo doc: docs/SWEEP-REGISTER-2026-08-23.md')

# ── artifact html ────────────────────────────────────────────────────────
h = []
STATIC_HEAD = '''<title>SEIRS Sweep Register</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;600&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>
:root{--ground:#FFFFFF;--surface:#F4F6F8;--sunken:#E9EDF1;--line:#DCE2E8;--ink:#12151A;--ink-2:#4A545F;--ink-3:#79848F;
--accent:#E0A800;--accent-ink:#6B4E00;--ok:#16794C;--warn:#B45309;--bad:#B4231F;
--a:#2563C9;--b:#16794C;--c:#7A3FBF;--d:#B4231F;--e:#0F766E;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0E1116;--surface:#161A21;--sunken:#1D222A;--line:#2A313B;
--ink:#E8ECF1;--ink-2:#A6B0BC;--ink-3:#77828F;--accent:#F2B705;--accent-ink:#F2B705;--ok:#46B883;--warn:#E0913B;--bad:#EF6B66;
--a:#6BA0F0;--b:#46B883;--c:#B08AE8;--d:#EF6B66;--e:#4CC3B5;}}
:root[data-theme="dark"]{--ground:#0E1116;--surface:#161A21;--sunken:#1D222A;--line:#2A313B;
--ink:#E8ECF1;--ink-2:#A6B0BC;--ink-3:#77828F;--accent:#F2B705;--accent-ink:#F2B705;--ok:#46B883;--warn:#E0913B;--bad:#EF6B66;
--a:#6BA0F0;--b:#46B883;--c:#B08AE8;--d:#EF6B66;--e:#4CC3B5;}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:"Source Sans 3",system-ui,sans-serif;font-size:16px;line-height:1.55;margin:0;padding:0 20px 90px;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto}
h1,h2,h3{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;margin:0;text-wrap:balance}
h1{font-size:clamp(38px,6vw,58px);line-height:1.02;text-transform:uppercase}
h2{font-size:clamp(24px,3.2vw,32px);text-transform:uppercase}
p{margin:0 0 12px;max-width:70ch}
code,.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.86em}
header.top{border-bottom:3px solid var(--ink);padding:38px 0 18px;margin-bottom:28px}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);margin-bottom:10px}
.lede{font-size:17.5px;color:var(--ink-2);max-width:64ch;margin-top:12px}
.counter{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-end;margin-top:22px}
.bignum{font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:clamp(42px,7vw,68px);line-height:.9}
.bignum small{display:block;font-family:"IBM Plex Mono",monospace;font-size:10.5px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);margin-top:7px;line-height:1.45}
.bignum.k{color:var(--ok)}.bignum.o{color:var(--bad)}.bignum.x{color:var(--accent-ink)}
.bar{height:12px;border-radius:6px;background:var(--sunken);overflow:hidden;margin-top:18px;border:1px solid var(--line)}
.bar i{display:block;height:100%;background:var(--ok)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;margin-bottom:14px}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:600px}
thead th{text-align:left;font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);font-weight:600;padding:10px 12px;background:var(--sunken);border-bottom:1px solid var(--line);white-space:nowrap}
tbody td{padding:9px 12px;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:none}
td.n{text-align:right;font-variant-numeric:tabular-nums;font-family:"IBM Plex Mono",monospace;white-space:nowrap}
tfoot td{padding:9px 12px;font-weight:700;background:var(--sunken);font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 18px;position:sticky;top:0;background:var(--ground);padding:12px 0;z-index:5;border-bottom:1px solid var(--line)}
button.f{font-family:"IBM Plex Mono",monospace;font-size:12px;font-weight:600;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer}
button.f[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}
section.app{margin:0 0 42px}
.apphead{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid var(--line);padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap}
.apphead .score{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--ink-3)}
.item{border:1px solid var(--line);border-left:3px solid var(--bad);border-radius:9px;background:var(--surface);padding:12px 15px;margin-bottom:8px}
.item.closed{border-left-color:var(--ok)}
.item.decision{border-left-color:var(--accent)}
.itop{display:flex;flex-wrap:wrap;gap:9px;align-items:baseline}
.iid{font-family:"IBM Plex Mono",monospace;font-size:11.5px;font-weight:600;color:var(--ink-3)}
.ititle{font-weight:700;font-size:15.5px;flex:1;min-width:220px}
.badge{font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;white-space:nowrap;text-transform:uppercase}
.b-HIGH{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
.b-MEDIUM{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.b-LOW{background:var(--sunken);color:var(--ink-2)}
.b-closed{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}
.b-open{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad)}
.b-decision{background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent-ink)}
.b-device{background:color-mix(in srgb,var(--a) 15%,transparent);color:var(--a)}
.b-crit{background:var(--bad);color:#fff}
.iloc{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink-3);margin-top:6px;word-break:break-word}
.idetail{font-size:14px;color:var(--ink-2);margin-top:7px}
.ifix{font-size:14px;margin-top:7px;padding-top:7px;border-top:1px dashed var(--line)}
.ifix b{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin-right:6px}
.note{border-left:3px solid var(--accent);background:var(--surface);padding:12px 16px;border-radius:0 8px 8px 0;font-size:14.5px;color:var(--ink-2);margin:16px 0}
.note b{color:var(--ink)}
footer{border-top:1px solid var(--line);padding-top:16px;color:var(--ink-3);font-size:13px;margin-top:30px}
</style>
'''

h.append(STATIC_HEAD)
h.append(
  '<div class="wrap"><header class="top">'
  '<div class="eyebrow">Device sweep and five-surface code audit &middot; ' + STAMP + ' &middot; Samsung A30</div>'
  '<h1>SEIRS Sweep Register</h1>'
  '<p class="lede">Every finding, listed individually so none can be skipped. '
  'Green is closed and verified, red is open, amber is waiting on a founder decision.</p>'
  '<div class="counter">'
  '<div class="bignum k">' + str(total_closed) + '<small>closed</small></div>'
  '<div class="bignum o">' + str(total_found - total_closed) + '<small>open</small></div>'
  '<div class="bignum x">' + str(len(decisions)) + '<small>need your<br>decision</small></div>'
  '<div class="bignum">' + str(total_found) + '<small>total findings</small></div>'
  '</div>'
  '<div class="bar"><i style="width:' + ('%.1f' % pct) + '%"></i></div>'
  '</header>')

# ledger table
h.append('<div class="tablewrap"><table><thead><tr><th>Surface</th>'
         '<th class="n">High</th><th class="n">Med</th><th class="n">Low</th><th class="n">Closed</th></tr></thead><tbody>')
for a, key in zip(apps, MODULES):
    t = tally(a.FINDINGS)
    tot = sum(t[s][0] for s in t); cl = sum(t[s][1] for s in t)
    h.append('<tr><td><span class="dot" style="background:%s"></span>%s</td>'
             '<td class="n">%d/%d</td><td class="n">%d/%d</td><td class="n">%d/%d</td>'
             '<td class="n">%d of %d</td></tr>'
             % (COLOR[key], e(a.APP), t['HIGH'][1], t['HIGH'][0], t['MEDIUM'][1], t['MEDIUM'][0],
                t['LOW'][1], t['LOW'][0], cl, tot))
h.append('</tbody><tfoot><tr><td>Total</td><td class="n">%d/%d</td><td class="n">%d/%d</td>'
         '<td class="n">%d/%d</td><td class="n">%d of %d</td></tr></tfoot></table></div>'
         % (grand['HIGH'][1], grand['HIGH'][0], grand['MEDIUM'][1], grand['MEDIUM'][0],
            grand['LOW'][1], grand['LOW'][0], total_closed, total_found))

h.append('<div class="note"><b>%d of these were found by driving the phone, not by reading code.</b> '
         'The audits are thorough on what code can show; a keyboard covering a field, a booking that '
         'cannot complete, and a colour that is off-brand only appear when someone uses the app.</div>'
         % device_found)

h.append('<div class="controls" role="group" aria-label="Filters">'
         '<button class="f" data-f="all" aria-pressed="true">All</button>'
         '<button class="f" data-f="open" aria-pressed="false">Open only</button>'
         '<button class="f" data-f="closed" aria-pressed="false">Closed only</button>'
         '<button class="f" data-f="decision" aria-pressed="false">Needs you</button>'
         '<button class="f" data-f="HIGH" aria-pressed="false">High only</button>'
         '<button class="f" data-f="device" aria-pressed="false">Found on device</button>'
         '</div>')

SEV_ORDER = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
for a, key in zip(apps, MODULES):
    t = tally(a.FINDINGS)
    tot = sum(t[s][0] for s in t); cl = sum(t[s][1] for s in t)
    h.append('<section class="app"><div class="apphead">'
             '<span class="dot" style="background:%s"></span><h2>%s</h2>'
             '<span class="score">%d of %d closed</span></div>' % (COLOR[key], e(a.APP), cl, tot))
    for f in sorted(a.FINDINGS, key=lambda x: (SEV_ORDER[x['sev']], x['id'])):
        cls = 'item ' + f['status']
        attrs = 'data-status="%s" data-sev="%s" data-device="%s"' % (
            f['status'], f['sev'], '1' if f.get('device') else '0')
        h.append('<div class="%s" %s>' % (cls, attrs))
        h.append('<div class="itop"><span class="iid">%s</span>' % e(f['id']))
        h.append('<span class="ititle">%s</span>' % e(f['title']))
        if f.get('critical'):
            h.append('<span class="badge b-crit">was live</span>')
        h.append('<span class="badge b-%s">%s</span>' % (f['sev'], f['sev']))
        h.append('<span class="badge b-%s">%s</span>' % (f['status'],
                 {'closed': 'closed', 'open': 'open', 'decision': 'needs you'}[f['status']]))
        if f.get('device'):
            h.append('<span class="badge b-device">on device</span>')
        h.append('</div>')
        h.append('<div class="iloc">%s</div>' % e(f['loc']))
        if f.get('detail'):
            h.append('<div class="idetail">%s</div>' % e(f['detail']))
        h.append('<div class="ifix"><b>%s</b>%s</div>' % (
            'Fixed' if f['status'] == 'closed' else 'Fix', e(f['fix'])))
        h.append('</div>')
    h.append('</section>')

h.append('''<footer>Generated from a single source of truth. The same data produces
<code>docs/SWEEP-REGISTER-2026-08-23.md</code> in the repo, so this record outlives the chat.</footer>
</div>
<script>
(function(){
  var btns=[].slice.call(document.querySelectorAll('button.f'));
  var items=[].slice.call(document.querySelectorAll('.item'));
  function apply(f){
    items.forEach(function(el){
      var show = f==='all'
        || (f==='open'     && el.dataset.status!=='closed')
        || (f==='closed'   && el.dataset.status==='closed')
        || (f==='decision' && el.dataset.status==='decision')
        || (f==='HIGH'     && el.dataset.sev==='HIGH')
        || (f==='device'   && el.dataset.device==='1');
      el.style.display = show ? '' : 'none';
    });
    document.querySelectorAll('section.app').forEach(function(s){
      var any=[].slice.call(s.querySelectorAll('.item')).some(function(i){return i.style.display!=='none';});
      s.style.display = any ? '' : 'none';
    });
  }
  btns.forEach(function(b){
    b.addEventListener('click',function(){
      btns.forEach(function(x){x.setAttribute('aria-pressed', x===b ? 'true':'false');});
      apply(b.dataset.f);
    });
  });
})();
</script>''')

OUT = os.path.join(os.path.dirname(HERE), 'sweep-register.html')
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(''.join(h))
print('artifact page: %s' % OUT)
print('TOTALS  found %d  closed %d  open %d  decisions %d  device-found %d'
      % (total_found, total_closed, total_found - total_closed, len(decisions), device_found))
for sev in ('HIGH', 'MEDIUM', 'LOW'):
    print('  %-7s %d found, %d closed' % (sev, grand[sev][0], grand[sev][1]))
