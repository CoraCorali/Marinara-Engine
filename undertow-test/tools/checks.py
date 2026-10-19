# Automatic checks for every saved reply. Writes results/_checks.json and a summary table.
import glob, json, os, re, sys
from collections import defaultdict
os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
PHRASES = ["fresh meat","spine","breath hitching","breath catching","husky","catching in throat","pupils blown wide","predatory","ozone","asset","shivers down","pupils dilated","nails biting","velvet","vise","vice","structural integrity","deep curve","furnace","throaty","calloused","guttural","slick","unadulterated","jaw clenched","jaw working","barely above a whisper","musk","breast","after a beat","a beat","the words sink in","something shifts","processes the words","a stone dropped into water","ripples through","a key turning in a lock","the air is thick","load-bearing","file it away","unhurried","structural failure","architectural","geometry"]
BRIEF = [r"here'?s the (thing|deal)", r"\btwo things\b", r"bottom line", r"long story short", r"real talk", r"honest answer", r"and honestly\?"]
FILLER = r"\b(really|genuinely|truly|actually)\b"
ANIMAL = r"\b(growl|purr|snarl|rumbl|whin)\w*"
CONTRAST = [r"\bnot\s+[^.,;!?]{1,40}?,?\s+but\s", r"\bwasn'?t\s+[^.!?]{1,40}[.!?]\s+it\s+was\b", r"\bnot just\b", r"\bless\s+\w+(\s+\w+)?\s+than\b", r"\bisn'?t\s+[^.!?]{1,40}[.!?]\s+it'?s\b"]
rows = []
for path in sorted(glob.glob("results/*/*.txt")):
    name = os.path.basename(path)[:-4]
    scen, model, preset, run = name.split("__")
    text = open(path).read()
    pos = {tag: text.find(tag) for tag in ["<scene_header", "<margin_notes", "</margin_notes>", "<story_ledger"]}
    fmt = all(v >= 0 for v in pos.values()) and pos["<scene_header"] < pos["<margin_notes"] < pos["</margin_notes>"] < pos["<story_ledger"]
    story = text[pos["</margin_notes>"] + 15 : pos["<story_ledger"]] if pos["</margin_notes>"] >= 0 and pos["<story_ledger"] > pos["</margin_notes>"] else re.sub(r"<scene_header.*?</scene_header>|<margin_notes.*?</margin_notes>|<story_ledger.*", "", text, flags=re.S)
    story = re.sub(r"<[^>]+>", "", story)
    low = text.lower(); slow = story.lower()
    row = dict(scen=scen, model=model, preset=preset, run=run, format=fmt,
        missing=[t for t, v in pos.items() if v < 0], words=len(story.split()),
        emdash=text.count("—"), brief=sum(len(re.findall(p, low)) for p in BRIEF),
        filler=len(re.findall(FILLER, slow)), animal=len(re.findall(ANIMAL, slow)),
        contrast=sum(len(re.findall(p, slow)) for p in CONTRAST),
        phrases=[p for p in PHRASES if re.search(r"\b" + re.escape(p) + r"\b", slow)],
        dont_stop=len(re.findall(r"don'?t stop", slow)), unless=len(re.findall(r"unless you (ask|want)", slow)))
    rows.append(row)
json.dump(rows, open("results/_checks.json", "w"), indent=1)
agg = defaultdict(lambda: defaultdict(float))
for r in rows:
    k = (r["model"], r["preset"]); a = agg[k]
    a["n"] += 1; a["format_ok"] += r["format"]; a["words"] += r["words"]; a["in_range"] += 350 <= r["words"] <= 600
    for f in ["emdash", "brief", "filler", "animal", "contrast", "dont_stop", "unless"]: a[f] += r[f]
    a["phrases"] += len(r["phrases"])
print("| Model | Preset | Replies | Format OK | Avg words | 350-600 | Em dashes | Briefing | Filler | Animal | Contrast | List phrases |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|")
for (m, p), a in sorted(agg.items()):
    n = a["n"]; print(f"| {m} | {p} | {int(n)} | {int(a['format_ok'])} | {a['words']/n:.0f} | {int(a['in_range'])} | {int(a['emdash'])} | {int(a['brief'])} | {int(a['filler'])} | {int(a['animal'])} | {int(a['contrast'])} | {int(a['phrases'])} |")
