# Interview screen typography

Derived offline from the existing `resume-serif-400/600.woff2` Adobe Source Han Serif
instances. See `resume-serif-README.md` for upstream pin and
`source-han-serif-resume-LICENSE.txt` for the complete SIL OFL notice.

`python3 scripts/prepare-interview-fonts.py` retains the public GB2312 Chinese set,
Latin characters and punctuation; it does not consume candidate or question text.
The modified family is renamed **YiZhi Interview Serif**. Both weights are actual
font instances, not synthetic bold. Existing full résumé/print fonts are unchanged.

Only the interview question uses these faces. Outfit supplies Western text;
uncovered Chinese characters fall back to the device's serif font without
discarding or replacing text. These assets are not a claim of full Unicode coverage.
