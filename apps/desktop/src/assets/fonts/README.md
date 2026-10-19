# Bundled fonts (01-barograph exploration)

Self-hosted, Latin subset only, loaded by `src/theme/barograph-fonts.css` with
`font-display: swap`. No CDN; the app CSP (`font-src 'self'`) is unchanged.
Chinese and other CJK user content falls back to the system
`"Microsoft YaHei UI", "Microsoft YaHei"` and is not bundled.

| Font | Package | License | Project | File | Bytes |
| --- | --- | --- | --- | --- | --- |
| Barlow Condensed 300 | `@fontsource/barlow-condensed@5.3.0` | OFL-1.1 (`barlow-condensed/LICENSE`) | https://github.com/jpt/barlow · https://fontsource.org/fonts/barlow-condensed | `barlow-condensed/barlow-condensed-latin-300-normal.woff2` | 21,080 |
| Barlow Condensed 400 | same | same | same | `barlow-condensed/barlow-condensed-latin-400-normal.woff2` | 21,164 |
| Barlow Condensed 500 | same | same | same | `barlow-condensed/barlow-condensed-latin-500-normal.woff2` | 21,424 |
| Barlow Condensed 600 | same | same | same | `barlow-condensed/barlow-condensed-latin-600-normal.woff2` | 22,308 |
| Instrument Sans 400 | `@fontsource/instrument-sans@5.3.0` | OFL-1.1 (`instrument-sans/LICENSE`) | https://github.com/Instrument/instrument-sans · https://fontsource.org/fonts/instrument-sans | `instrument-sans/instrument-sans-latin-400-normal.woff2` | 16,860 |
| Instrument Sans 500 | same | same | same | `instrument-sans/instrument-sans-latin-500-normal.woff2` | 17,232 |
| Spline Sans Mono 400 | `@fontsource/spline-sans-mono@5.3.0` | OFL-1.1 (`spline-sans-mono/LICENSE`) | https://github.com/SorkinType/SplineSansMono · https://fontsource.org/fonts/spline-sans-mono | `spline-sans-mono/spline-sans-mono-latin-400-normal.woff2` | 12,888 |

Total: **132,956 bytes** (about 130 KB) of WOFF2, within the 150 KB Latin budget.

License check: the `license` field of each npm package is `OFL-1.1`, and each
package's `LICENSE` file is the SIL Open Font License 1.1 text with the
project's copyright line; those files are copied next to the fonts.

Installer impact: the fonts are already compressed WOFF2, so the NSIS
installer and the built `dist/` grow by roughly the same 133 KB. No npm
dependency was added; the files were taken from `npm pack` tarballs outside
the repository.
