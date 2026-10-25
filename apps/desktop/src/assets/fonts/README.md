# Bundled fonts (08-negative exploration)

Self-hosted, Latin subset only, loaded by `src/theme/negative-fonts.css` with
`font-display: swap`. No CDN; the app CSP (`font-src 'self'`) is unchanged.
Chinese and other CJK user content falls back to the system
`"Microsoft YaHei UI", "Microsoft YaHei"` and is not bundled.
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
