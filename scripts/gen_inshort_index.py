#!/usr/bin/env python3
"""Regenerate <!-- inshort-index:start/end --> blocks in content/*.md.
DRAFT helper for readability A+B. Run from repo root:
  python3 scripts/gen_inshort_index.py
Does not commit. Skips files with no markers unless --insert-missing.
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
START, END = "<!-- inshort-index:start -->", "<!-- inshort-index:end -->"

SECTIONS = [
    "1. Ethical and Philosophical Framework.md",
    "2. Political and Social Character.md",
    "3. Authority & Civil Liberties.md",
    "4. Religion & Secularism.md",
    "5. Domestic Policy & Governance.md",
    "6. Criminal Justice & Security.md",
    "7. Cultural & Social Issues.md",
    "8. Foreign Policy & International Relations.md",
    "9. Energy & Environment.md",
    "10. Bioethics, Progress, & Technology.md",
    "11. Modern Political Parties.md",
    "12. Current Administration.md",
    "13. News Commentary.md",
]

def truncate(s: str, n: int = 110) -> str:
    s = re.sub(r"\*\*", "", s)
    if len(s) <= n:
        return s
    return s[:n].rsplit(" ", 1)[0].rstrip(".,;:") + "…"

def items_for(path: Path, label: str):
    text = path.read_text(encoding="utf-8")
    if label == "S13":
        items = []
        parts = re.split(r"(?m)^(## .+)$", text)
        for i in range(1, len(parts), 2):
            h = parts[i][3:].strip()
            body = parts[i + 1]
            if h in ("Latest", "Watching"):
                items.append((h, "Rolling list" if h == "Latest" else "Items to re-check"))
            elif h.startswith("Case:"):
                view = re.search(r"\*\*My view[^*]*:\*\*\s*(.+)", body)
                blurb = truncate(view.group(1), 100) if view else "Case write-up"
                items.append((h, blurb))
        return "Case index", "Jump links for every case on this page.", items

    lines = text.splitlines()
    headings = []
    for i, ln in enumerate(lines):
        m = re.match(r"^(#{2,3})\s+(.+)$", ln)
        if m:
            headings.append((i, len(m.group(1)), m.group(2).strip()))
    items, seen = [], set()
    for i, ln in enumerate(lines):
        if not re.match(r"^>\s*\[!tldr\][+-]?\s*In short\s*$", ln):
            continue
        blurb = None
        for ln2 in lines[i + 1 :]:
            if ln2.strip() == "":
                continue
            if not ln2.startswith(">") or re.match(r"^>\s*\[!", ln2):
                break
            blurb = truncate(re.sub(r"^>\s?", "", ln2).strip())
            break
        if not blurb:
            continue
        cand = [h for h in headings if h[0] < i]
        if not cand:
            continue
        h_line, level, title = cand[-1]
        if level == 2 and title.startswith("Part "):
            sub = [h for h in cand if h[0] > h_line and h[1] == 3]
            if sub:
                h_line, level, title = sub[-1]
        if title in seen or title in ("Core Principles", "Latest", "Watching", "In short index", "Case index"):
            continue
        seen.add(title)
        items.append((title, blurb))
    return "In short index", "One line per topic — jump to the full write-up.", items

def render(title, intro, items):
    out = [f"## {title}", "", intro, "", START]
    for h, b in items:
        out.append(f"- [[#{h}|{h}]] — {b}")
    out += [END, ""]
    return "\n".join(out)

def upsert(path: Path, block: str, insert_missing: bool) -> str:
    text = path.read_text(encoding="utf-8")
    if START in text and END in text:
        new = re.sub(
            re.escape(START) + r".*?" + re.escape(END),
            START + "\n" + "\n".join(block.splitlines()[block.splitlines().index(START) + 1 : block.splitlines().index(END)]) + "\n" + END,
            text,
            count=1,
            flags=re.S,
        )
        # simpler: replace whole ## In short index / Case index section if present
        new = re.sub(
            r"(?ms)^## (?:In short index|Case index)\n.*?" + re.escape(END) + r"\n?",
            block if block.endswith("\n") else block + "\n",
            text,
            count=1,
        )
        return new
    if not insert_missing:
        return text
    # insert after <span id="top"></span> or after frontmatter / start
    if '<span id="top"></span>' in text:
        return text.replace('<span id="top"></span>\n', '<span id="top"></span>\n\n' + block + "\n", 1)
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            pos = end + 4
            return text[:pos] + "\n\n" + block + "\n" + text[pos:]
    return block + "\n" + text

def main():
    insert = "--insert-missing" in sys.argv
    dry = "--dry-run" in sys.argv
    for i, name in enumerate(SECTIONS, 1):
        label = f"S{i}" if i <= 13 else name
        # map file index to S label by filename number
        m = re.match(r"^(\d+)\.", name)
        label = f"S{m.group(1)}" if m else name
        path = CONTENT / name
        title, intro, items = items_for(path, label)
        block = render(title, intro, items)
        new = upsert(path, block, insert_missing=insert)
        if new != path.read_text(encoding="utf-8"):
            print(f"UPDATE {name} ({len(items)} items)")
            if not dry:
                path.write_text(new, encoding="utf-8")
        else:
            print(f"skip   {name} (no markers; pass --insert-missing)")

if __name__ == "__main__":
    main()
