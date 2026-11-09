# Resume print fonts

Upstream: Adobe Source Han Serif, CN subset variable TrueType face.
https://github.com/adobe-fonts/source-han-serif/blob/release/Variable/WOFF2/TTF/Subset/SourceHanSerifCN-VF.ttf.woff2

Pinned input SHA-256: `556749ba783b148fa1f48644e8883e5b9351f01abd0d1faad0ba24a21185e76a`.
License: SIL OFL 1.1, full notice in `source-han-serif-resume-LICENSE.txt`.

Modified font family: **YiZhi Resume Serif**, to respect the upstream reserved
name. `scripts/prepare-resume-print-font.py` generates real weight 400 and 600
instances using fontTools 4.60.2. Duplicate Unicode aliases get distinct glyph
IDs with identical outlines and metrics. This prevents Chromium's PDF
ToUnicode map choosing a Kangxi radical instead of the actual input character.
No résumé text, private glyph subset or candidate facts are embedded in assets.

Only serif PDF printing loads these fonts; the existing screen typography stays
unchanged. The Save PDF action waits for both faces and visibly fails closed if
they cannot load. Native browser print still follows normal browser behavior.
