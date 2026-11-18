"""Offline, public character-set subset of the already licensed print fonts.

No candidate text or private question determines the glyph set.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "public" / "fonts"


def public_characters():
    points = set(range(0x20, 0x100))
    for first, last in [(0x2000, 0x206F), (0x3000, 0x303F), (0xFF00, 0xFFEF)]:
        points.update(range(first, last + 1))
    for lead in range(0xB0, 0xF8):
        for trail in range(0xA1, 0xFF):
            try:
                points.add(ord(bytes([lead, trail]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    return points


for weight in (400, 600):
    source = FONT_DIR / f"resume-serif-{weight}.woff2"
    target = FONT_DIR / f"interview-serif-{weight}.woff2"
    font = TTFont(source, recalcTimestamp=False)
    wanted = public_characters() & set(font.getBestCmap())
    options = subset.Options()
    options.flavor = "woff2"
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=wanted)
    worker.subset(font)
    family = "YiZhi Interview Serif"
    for record in font["name"].names:
        if record.nameID in (1, 4, 6):
            name = family if record.nameID == 1 else f"{family} {weight}"
            if record.nameID == 6:
                name = f"YiZhiInterviewSerif-{weight}"
            record.string = name.encode(record.getEncoding())
    font.flavor = "woff2"
    font.save(target)
    result = TTFont(target)
    assert wanted <= set(result.getBestCmap()), "Subset dropped requested glyphs"
    print(f"{target.name}: {target.stat().st_size} bytes, {len(wanted)} public glyphs")
