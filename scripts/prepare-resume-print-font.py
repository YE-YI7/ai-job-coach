"""Build OFL-licensed print faces with one Unicode value per encoded glyph.

Chromium can otherwise choose a Kangxi alias for a shared CJK glyph in the
PDF ToUnicode table. Outlines and metrics are unchanged; only aliases are split.
Run offline with fontTools 4.60.2 and the pinned Adobe TTF WOFF2 source.
"""
import argparse,copy,hashlib,json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(args.source.read_bytes()).hexdigest()
assert source_hash=='556749ba783b148fa1f48644e8883e5b9351f01abd0d1faad0ba24a21185e76a','UNREVIEWED_FONT_SOURCE'
report={'sourceSha256':source_hash,'faces':{}}
for weight,label in [(400,'Regular'),(600,'Semibold')]:
    font=instantiateVariableFont(TTFont(args.source),{'wght':weight},inplace=True)
    cmap=font.getBestCmap()
    order=list(font.getGlyphOrder())
    seen=set();mapped={};duplicates=0
    for codepoint,name in sorted(cmap.items()):
        if name in seen:
            alias=f'yizhi{codepoint:06X}'
            font['glyf'][alias]=copy.deepcopy(font['glyf'][name])
            font['hmtx'].metrics[alias]=font['hmtx'].metrics[name]
            if 'vmtx' in font:font['vmtx'].metrics[alias]=font['vmtx'].metrics[name]
            order.append(alias);mapped[codepoint]=alias;duplicates+=1
        else:
            seen.add(name);mapped[codepoint]=name
    font.setGlyphOrder(order)
    for table in font['cmap'].tables:
        if table.isUnicode() and hasattr(table,'cmap'):
            table.cmap={cp:mapped.get(cp,name) for cp,name in table.cmap.items()}
    # Required by the upstream Reserved Font Name condition for modified fonts.
    family='YiZhi Resume Serif'
    names={1:family,2:label,3:f'YiZhiResumeSerif-{label}-1',4:f'{family} {label}',
           6:f'YiZhiResumeSerif-{label}',16:family,17:label}
    for record in font['name'].names:
        if record.nameID in names:record.string=names[record.nameID].encode(record.getEncoding(),errors='replace')
    font.flavor='woff2'
    target=args.output/f'resume-serif-{weight}.woff2';font.save(target)
    readback=TTFont(target).getBestCmap()
    assert set(readback)==set(cmap)
    assert len(set(readback.values()))==len(readback)
    report['faces'][str(weight)]={'aliasesSeparated':duplicates,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size}
print(json.dumps(report,indent=2))
