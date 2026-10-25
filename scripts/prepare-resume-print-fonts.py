"""One-off asset build; not a runtime dependency.
Requires fonttools==4.67.0 and brotli==1.2.1. Source/rights: public/fonts/README.md.
Usage: python prepare-resume-print-fonts.py /absolute/NotoSerifSC.ttf /absolute/output
"""
from pathlib import Path
from copy import deepcopy
import hashlib,json,sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

source,output=map(Path,sys.argv[1:3])
assert source.is_absolute() and output.is_absolute()
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
assert source_hash=='050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9'
font=TTFont(source)
unicodes=set()
for cp in font.getBestCmap():
    try:chr(cp).encode('gb2312');unicodes.add(cp)
    except UnicodeEncodeError:pass
    if cp<0x250 or 0x2000<=cp<=0x22ff or 0x2500<=cp<=0x25ff or 0x3000<=cp<=0x303f or 0xff00<=cp<=0xffef:
        unicodes.add(cp)
options=subset.Options();options.layout_languages=['ZHS ','dflt']
selector=subset.Subsetter(options=options);selector.populate(unicodes=unicodes);selector.subset(font)
output.mkdir(parents=True,exist_ok=True)
assets=[]
for weight,name in [(400,'noto-serif-sc-print-regular.woff2'),(600,'noto-serif-sc-print-semibold.woff2')]:
    face=instantiateVariableFont(deepcopy(font),{'wght':weight},inplace=True,updateFontNames=True)
    assert 'fvar' not in face and 'glyf' in face
    face.flavor='woff2';face.save(output/name)
    assets.append({'file':name,'characters':len(face.getBestCmap()),'bytes':(output/name).stat().st_size,
                   'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()})
(output/'noto-serif-sc-print.provenance.json').write_text(json.dumps({
    'sourceCommit':'8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5','sourceSha256':source_hash,
    'scope':'GB2312 encodable characters, Latin, punctuation, currency, arrows and fullwidth; uncommon names use existing device fallbacks',
    'build':'fonttools 4.67.0 / brotli 1.2.1; static 400/600, ZHS and default layout', 'assets':assets},indent=2)+'\n')
