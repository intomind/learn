"""Check the book before anything is published, in one command.

    python3 check.py

- every page has a title and a description, and loads nothing from
  another site;
- every link between pages resolves, to the page and to the section;
- every figure on a page is one figures.js can draw, and every photograph
  and picture it shows is here;
- the prose keeps the house style: no em dash, no semicolon;
- nothing carries a personal address, a path on somebody's machine or an
  address on a local network.
"""
from __future__ import annotations

import html
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = [(r"(?i)[\w.+-]+@gmail\.com", "a personal address"), (r"(?i)/home/[a-z]", "a path on somebody's machine"),
          (r"\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b", "an address on a local network")]
# A script a page may load from another site, by page.
FOREIGN: dict[pathlib.Path, str] = {}
# Links checked by their form, for files that aren't here.
UNCHECKED: list[re.Pattern[str]] = []


def pages() -> list[pathlib.Path]:
    return sorted(p for p in HERE.rglob("*.html") if "src" not in p.relative_to(HERE).parts and ".git" not in p.parts)


def ids(text: str) -> set[str]:
    return set(re.findall(r'\sid="([^"]+)"', text))


def prose_of(text: str) -> str:
    body = re.search(r"<body[^>]*>(.*)</body>", text, re.S)
    text = body.group(1) if body else text
    text = re.sub(r"<(script|style|pre|code)[^>]*>.*?</\1>", " ", text, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", text))


def figure_names() -> set[str]:
    return set(re.findall(r'fig\("([a-z0-9-]+)"', (HERE / "assets" / "figures.js").read_text()))


def main() -> int:
    problems: list[str] = []
    found = pages()
    texts = {p: p.read_text() for p in found}
    figs = figure_names()
    for p, text in texts.items():
        name = str(p.relative_to(HERE))
        if not re.search(r"<title>[^<]+</title>", text):
            problems.append(f"{name}: no title")
        if not re.search(r'<meta name="description" content="[^"]+">', text):
            problems.append(f"{name}: no description")
        for tag in re.findall(r"<(?:link|script|img|iframe|source)\b[^>]*>", text):
            if f'src="{FOREIGN.get(p.relative_to(HERE))}"' in tag:
                continue
            if re.search(r'(?:src|href)="(?:https?:)?//', tag):
                problems.append(f"{name}: loads from another site: {tag[:80]}")
        for href in re.findall(r'(?<![-\w])(?:href|src)="([^"]+)"', text):
            if re.match(r"(?:https?:|mailto:|data:|#$)", href):
                continue
            target, _, anchor = href.partition("#")
            target = target.partition("?")[0]
            if any(u.fullmatch(target) for u in UNCHECKED):
                continue
            dest = (HERE / target.lstrip("/")).resolve() if target.startswith("/") else (p.parent / target).resolve() if target else p
            if dest.is_dir():
                dest = dest / "index.html"
            if not dest.exists():
                problems.append(f"{name}: links to {href}, which does not exist")
            elif anchor and dest.suffix == ".html" and anchor not in ids(texts.get(dest) or dest.read_text()):
                problems.append(f"{name}: links to {href}, and that section does not exist")
        for fig in re.findall(r'data-fig="([^"]+)"', text):
            if fig not in figs:
                problems.append(f"{name}: asks for a figure named {fig}, which figures.js cannot draw")
        for shot in re.findall(r'data-shot="([^"]+)"', text):
            for theme in ("dark", "light"):
                if not (HERE / "assets" / "shots" / f"{shot}-{theme}.webp").exists():
                    problems.append(f"{name}: shows the photograph {shot}-{theme}.webp, which assets/shots does not have")
        for src in re.findall(r'data-src="([^"]+)"', text):
            for theme in ("dark", "light"):
                if not (HERE / f"{src.lstrip('/')}-{theme}.webp").exists():
                    problems.append(f"{name}: shows the picture {src}-{theme}.webp, which does not exist")
        for left in ("<!--contents-->", "<!--labs-->", "<!--vocabulary-->", "<!--crumbs-->"):
            if left in text:
                problems.append(f"{name}: {left} was not filled in")
        prose = prose_of(text)
        if "—" in text:
            problems.append(f"{name}: an em dash")
        if ";" in prose:
            problems.append(f"{name}: a semicolon in the prose")
    try:
        tracked = subprocess.run(["git", "ls-files"], cwd=HERE, capture_output=True, text=True, check=True).stdout.split()
    except (OSError, subprocess.CalledProcessError):
        tracked = []
    for name in tracked or [str(p.relative_to(HERE)) for p in found]:
        if name == "check.py":
            continue
        try:
            text = (HERE / name).read_text()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        for pattern, why in PUBLIC:
            for m in re.finditer(pattern, text):
                problems.append(f"{name}: names {m.group(0)}, which is {why}")
    print("-" * 52)
    if problems:
        print(f"{len(problems)} problems:")
        for p in problems:
            print(f"  {p}")
        return 1
    done = f"{len(found)} pages, every link resolves, every figure draws, and the house style holds"
    print(done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
