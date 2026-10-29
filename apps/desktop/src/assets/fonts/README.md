# Bundled fonts (UI v2)

## CJK licence review (2026-10-26, before conversion)

LXGW Neo XiHei v1.308 is derived from IPAexGothic. IPA Font License 1.0
Article 1(3), Article 3(1), and the original publisher's
[FAQ 3.1–3.3](https://moji.or.jp/ipafont/faq/) explicitly treat subsetting **and
format conversion** as derivation. A full-font WOFF2 conversion does not avoid
those conditions. The derived family, PostScript and file names will be
**Enouia Text SC**, with no LXGW/Neo XiHei/IPA names in those naming fields.
Original attribution and licence metadata stay intact.

The derivative remains under IPA Font License 1.0. Its complete Japanese/English
[licence](https://github.com/lxgw/LxgwNeoXiHei/blob/main/LICENSE.md), generated
WOFF2 files, transformation script and release notes accompany this source.
The app must make the licence readable and provide a Settings entry to replace
the Chinese body face with locally installed, unmodified **IPAexGothic**, obtained
from the [original publisher](https://moji.or.jp/ipafont/ipafontdownload/).
Users install the original font through Windows and restart Runtime; no native
filesystem/network permission or automatic download is added. The restoration
choice must exclude Enouia Text SC rather than silently falling back to it.

This follows the [original licence](https://moji.or.jp/ipafont/license/) and
FAQ 2.4 / 3.3.2, and the derivative author's
[embedding guidance](https://github.com/lxgw/lxgw/blob/main/documents/xizhi_embedding_instructions.md).
The public generated files and instructions are available under the same IPA
licence; third parties may redistribute them under its terms. No raw TTF is
committed. Preserve all supplementary generated files needed for further edits.

Sarasa Mono SC, M PLUS 1 Code and Zen Kaku Gothic New use OFL-1.1. Their full
copyright/licence texts must accompany each package and remain in font metadata.
The Sarasa licence reserves **Source**, which our primary family names do not
use; the supplied M PLUS and Zen licences declare no Reserved Font Name.
The dictionary subsets retain their selected family names; none is sold alone.

## Generated CJK package (updated 2026-10-29)

| Family / source | Scope | WOFF2 files | Bytes |
| --- | --- | ---: | ---: |
| Sarasa Mono SC v1.0.43 | dictionary CJK; Light 300, Regular 400–500, SemiBold 600 | 3 | 453,100 |
| M PLUS 1 Code 1.100 | dictionary CJK; variable 300–600 | 1 | 158,120 |
| Enouia Text SC, derived from LXGW Neo XiHei release v1.308 | all 27,687 mapped characters and original UVS; 400 | 100 | 3,986,136 |
| Zen Kaku Gothic New 1.002 | all 7,737 mapped characters per weight; 300/400/500/700 | 400 | 5,094,468 |

CJK total: **9,691,824 bytes** after the native-copy dictionary update (1,437 keys per language). Fonts use `font-display: swap`; body fonts have
one interface-character slice and 99 remaining Unicode slices per weight.
Original hinting, layout features, copyright and licence metadata are retained.
The label dictionaries are `zh-Hans.ts` and `ja.ts`; characters outside their
subsets use the respective body stack. M PLUS lacks fullwidth slash/colon,
U+FF0F/U+FF1A; both are covered by the bundled Zen body face.

The supplied LXGW file's internal name-table version is 1.307, although the
official release is v1.308. Its 7,473,598 bytes and SHA-256
`80415d3666d9f51cf42ecf82c5350488e6b3f282ab46a3b90dcaa5e212564ecc`
match the official v1.308 asset digest. The generator checks this identified
input instead of guessing from the internal version string. Original:
https://github.com/lxgw/LxgwNeoXiHei/releases/tag/v1.308 . No original font was
downloaded again. Sarasa source: https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.43 ;
M PLUS / Zen sources: https://github.com/google/fonts/tree/main/ofl/mplus1code
and https://github.com/google/fonts/tree/main/ofl/zenkakugothicnew .

`cjk-manifest.json` records source versions, character coverage, UVS, per-file
bytes and Unicode ranges. `src/theme/cjk-faces.css` is generated, with external
`?no-inline` URLs so small slices cannot enter the English entry CSS as base64.
`i18n/index.ts` loads face declarations with CJK dictionaries; English does not
request them. Cold native no-Vault Home font payload (including Latin):
**en 67,892 B; zh-Hans 474,908 B; ja 313,536 B**.

Reproduce from the separately supplied original-font directory, in `apps/desktop`:

```text
python -m venv ../../.design/font-tools-env
../../.design/font-tools-env/Scripts/python -m pip install "fonttools[woff]==4.67.0" "brotli==1.2.1"
node scripts/subset-cjk-fonts.mjs --fonts <original-font-directory> --python ../../.design/font-tools-env/Scripts/python.exe
```

The script validates saved WOFF2 character maps, original UVS coverage, IPA
renaming and the M PLUS weight range. It leaves all source TTFs untouched and
writes no TTF into this package. Regenerate after dictionary changes. FontTools
API references: https://fonttools.readthedocs.io/en/latest/subset/index.html and
https://fonttools.readthedocs.io/en/latest/varLib/instancer.html .

Settings → Fonts and licences displays complete source licences in a deferred
chunk. The original-font option loads only `local('IPAexGothic')` /
`local('IPAexゴシック')`, verifies availability before selection, and stores a local
appearance preference. It does not download, install, modify or convert the
original font. If a previously selected original is later removed, the CSS
uses Windows fallback faces and excludes this derivative. To return to the
packaged face, select Bundled font. No model, personal data or native settings
are involved. Native testing verified the missing-original refusal; the
successful-original case was only checked with a controlled availability model
because IPAexGothic is not installed on this test machine.

## Existing Latin package

Self-hosted, Latin subset only, loaded by `src/theme/negative-fonts.css` with
`font-display: swap`. No CDN; the app CSP (`font-src 'self'`) is unchanged.
The Latin files below are unchanged. CJK text follows the package and language
stacks described above, with Windows system faces only as final fallbacks.
The two files are the same ones the 05-microfiche variant uses (copied from its
worktree; no dependency was added). 01's Barlow Condensed, Instrument Sans and
Spline Sans Mono were removed.

| Family | Package (version) | License | Project page | File | Bytes |
| --- | --- | --- | --- | --- | --- |
| Martian Mono (variable: wdth 75–112.5, wght 100–800) | `@fontsource-variable/martian-mono` 5.3.0 | OFL-1.1 (`martian-mono/LICENSE`, 4,389 bytes) | https://github.com/evilmartians/mono · https://fontsource.org/fonts/martian-mono | `martian-mono/martian-mono-latin-wdth-normal.woff2` | 38,492 |
| Geist (variable: wght 100–900) | `@fontsource/geist` 5.3.0 | OFL-1.1 (`geist/LICENSE`, 4,486 bytes) | https://github.com/vercel/geist-font · https://fontsource.org/fonts/geist | `geist/geist-latin-wght-normal.woff2` | 29,400 |

Total woff2: **67,892 bytes** (about 66 KB), under the 150 KB Latin budget.

License check: the `license` field of each npm package is `OFL-1.1` (checked
2026-10-17), and each package's `LICENSE` is the SIL Open Font License 1.1 text
with the project's copyright line; both are copied next to the fonts.

Installer impact: the fonts are already compressed WOFF2, so the NSIS installer
and the built `dist/` grow by roughly the same 66 KB plus the two licence files
(about 9 KB). 01's three families were 133 KB, so this variant is 65 KB lighter
than 01.
