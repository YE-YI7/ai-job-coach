"""Offline, public character-set subset of pinned Adobe Source Han Sans.

No candidate text or private question determines the glyph set.
"""
import argparse
import hashlib
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "public" / "fonts"
parser = argparse.ArgumentParser()
parser.add_argument("--source-dir", type=Path, required=True)
args = parser.parse_args()
SOURCES = {
    500: ("SourceHanSansSC-Medium.otf", "1df61d31687d04fd2f928a3bb6ca6cd61f0e988cc267cf317f32406edbb49f70"),
    700: ("SourceHanSansSC-Bold.otf", "df2b90f5bcc6d01dfc964cec5f6d535d6b6aebd26ed7fd79a9c1b3f2112fcb6b"),
}


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


for weight, (filename, digest) in SOURCES.items():
    source = args.source_dir / filename
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest, "Upstream font changed"
    target = FONT_DIR / f"interview-sans-{weight}.woff2"
    font = TTFont(source, recalcTimestamp=False)
    assert font["OS/2"].usWeightClass == weight, "Not an actual requested weight"
    wanted = public_characters() & set(font.getBestCmap())
    options = subset.Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=wanted)
    worker.subset(font)
    family = "YiZhi Interview Sans"
    for record in font["name"].names:
        if record.nameID in (1, 4, 6):
            name = family if record.nameID == 1 else f"{family} {weight}"
            if record.nameID == 6:
                name = f"YiZhiInterviewSans-{weight}"
            record.string = name.encode(record.getEncoding())
    if "CFF " in font:
        cff = font["CFF "].cff
        cff.fontNames[0] = f"YiZhiInterviewSans-{weight}"
        cff.topDictIndex[0].FamilyName = family
        cff.topDictIndex[0].FullName = f"{family} {weight}"
    font.flavor = "woff2"
    font.save(target)
    result = TTFont(target)
    assert wanted <= set(result.getBestCmap()), "Subset dropped requested glyphs"
    print(f"{target.name}: {target.stat().st_size} bytes, {len(wanted)} public glyphs")
