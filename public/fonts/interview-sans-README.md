# Interview screen fonts

Adobe Source Han Sans SC, official release OTF files:

- Medium (500): https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/OTF/SimplifiedChinese/SourceHanSansSC-Medium.otf
- Bold (700): https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/OTF/SimplifiedChinese/SourceHanSansSC-Bold.otf

Input SHA-256 pins are checked by `scripts/prepare-interview-fonts.py`.
Run it offline with `--source-dir <directory containing the two upstream files>`.
It retains the public GB2312 Chinese set, Latin and punctuation, not private
candidate/question glyphs. The renamed modified family is **YiZhi Interview Sans**.
Both weights are actual font files, not synthetic bold or outlines.

Complete SIL OFL notice: `OFL-SourceHanSans.txt`. Existing full résumé print
fonts are unchanged. The rejected screen-only serif assets were removed;
they remain recoverable in Git at `b095b9d`.
