import re, json, io, sys

src = io.open(r'E:\dev\claude-royale\shared\src\cards.ts', encoding='utf-8').read()

# Each card: `key: {` then `id: 'key', name: 'X',` ... then `description: '...'`
pat = re.compile(
    r"(\w+):\s*\{\s*\n\s*id:\s*'\w+',\s*name:\s*'([^']*)',"
    r"(?:.|\n)*?description:\s*\n?\s*'((?:[^'\\]|\\.)*)'",
    re.M,
)

seen = set()
out = []
for m in pat.finditer(src):
    cid, nm, desc = m.group(1), m.group(2), m.group(3)
    if cid in seen:
        continue
    seen.add(cid)
    out.append({'id': cid, 'name': nm, 'desc': desc.replace("\\'", "'")})

io.open(r'E:\dev\claude-royale\scripts\cards-en.json', 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, indent=2)
)
print('COUNT', len(out))
