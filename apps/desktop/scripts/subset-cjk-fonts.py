"""UI v2 CJK packaging. Requires fonttools[woff]==4.67.0 / brotli==1.2.1.

All character mappings and UVS pairs are retained across the body slices.
Only the two label faces use dictionary-limited CJK sets. Hinting is retained.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor
from hashlib import sha256
import json
import logging
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

logging.getLogger('fontTools').setLevel(logging.ERROR)


def ranges(points):
    values = sorted(set(points))
    result = []
    for cp in values:
        if result and cp == result[-1][1] + 1:
            result[-1][1] = cp
        else:
            result.append([cp, cp])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in result)


def variation_pairs(font):
    return {(base, selector) for table in font['cmap'].tables if table.format == 14
            for selector, entries in table.uvsDict.items() for base, _ in entries}


def generate(job):
    source, output, points, family, weight, rename, variable = job
    font = TTFont(source, recalcTimestamp=False)
    selectors = {s for base, s in variation_pairs(font) if base in points}
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.layout_features = ['*']
    options.notdef_outline = True
    options.recalc_timestamp = False
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=set(points) | selectors)
    sub.subset(font)
    if variable:
        instantiateVariableFont(font, {'wght': (300, 400, 600)}, inplace=True)
    if rename:
        # IPA Article 3(1)(4): rename every primary naming record, including
        # platform/localized variants. Attribution/licence fields are untouched.
        replacements = {1: family, 2: 'Regular', 3: 'EnouiaTextSC-Regular-1.0',
                        4: family, 6: 'EnouiaTextSC-Regular', 16: family,
                        17: 'Regular', 18: family, 21: family, 22: 'Regular'}
        for record in font['name'].names:
            if record.nameID in replacements:
                record.string = replacements[record.nameID].encode(record.getEncoding())
        for name_id, value in replacements.items():
            font['name'].setName(value, name_id, 3, 1, 0x409)
    font.flavor = 'woff2'
    font.save(output)
    font.close()
    saved = TTFont(output)
    actual = set(saved.getBestCmap())
    if actual != set(points):
        raise ValueError(f'Character coverage differs: {output}')
    if rename:
        for record in saved['name'].names:
            if record.nameID in {1, 3, 4, 6, 16, 18, 21}:
                text = record.toUnicode().lower()
                if any(old in text for old in ['lxgw', 'xihei', 'ipa', '霞鹜', '晰黑']):
                    raise ValueError(f'Original primary name retained: {output}')
    if variable:
        axis = saved['fvar'].axes[0]
        if (axis.minValue, axis.maxValue) != (300, 600):
            raise ValueError('Incorrect M PLUS weight range')
    result = {'file': Path(output).parent.name + '/' + Path(output).name,
              'family': family, 'weight': weight, 'bytes': Path(output).stat().st_size,
              'characters': len(actual), 'unicodeRange': ranges(actual | selectors),
              'variationPairs': sorted(variation_pairs(saved))}
    saved.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    for name in ['fonts', 'characters', 'output', 'css']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    root, output = Path(args.fonts), Path(args.output).resolve()
    characters = json.loads(Path(args.characters).read_text(encoding='utf-8'))
    definitions = [
        ('sarasa-mono-sc', 'SarasaMonoSC-Light.ttf', 'Sarasa Mono SC', '300', 'zh-Hans', False, False),
        ('sarasa-mono-sc', 'SarasaMonoSC-Regular.ttf', 'Sarasa Mono SC', '400 500', 'zh-Hans', False, False),
        ('sarasa-mono-sc', 'SarasaMonoSC-SemiBold.ttf', 'Sarasa Mono SC', '600', 'zh-Hans', False, False),
        ('m-plus-1-code', 'MPLUS1Code[wght].ttf', 'M PLUS 1 Code', '300 600', 'ja', False, True),
        ('lxgw-neo-xihei', 'LXGWNeoXiHei.ttf', 'Enouia Text SC', '400', 'zh-Hans', True, False),
        *[('zen-kaku-gothic-new', f'ZenKakuGothicNew-{style}.ttf', 'Zen Kaku Gothic New', weight, 'ja', False, False)
          for style, weight in [('Light', '300'), ('Regular', '400'), ('Medium', '500'), ('Bold', '700')]],
    ]
    jobs, originals = [], []
    for folder, filename, family, weight, language, rename, variable in definitions:
        source = root / folder / filename
        font = TTFont(source, lazy=True)
        mapping = set(font.getBestCmap())
        body = rename or folder == 'zen-kaku-gothic-new'
        if rename and sha256(source.read_bytes()).hexdigest() != '80415d3666d9f51cf42ecf82c5350488e6b3f282ab46a3b90dcaa5e212564ecc':
            raise ValueError('Expected the verified v1.308 release asset (internal version 1.307)')
        original = {'file': filename, 'family': family, 'version': font['name'].getDebugName(5),
                    'characters': len(mapping), 'variationPairs': sorted(variation_pairs(font)), 'fullCharacterSet': body}
        originals.append(original)
        font.close()
        ui = set(characters[language])
        if body:
            # One UI slice prevents a short interface from touching dozens of
            # arbitrary Unicode bins; all remaining mapped characters use 99 bins.
            common = mapping & ui
            remaining = sorted(mapping - common)
            chunks = [sorted(common)] + [remaining[i * len(remaining) // 99:(i + 1) * len(remaining) // 99] for i in range(99)]
        else:
            desired = {cp for cp in ui if cp >= 0x2E80}
            missing = desired - mapping
            if missing:
                fallback = TTFont(root / 'zen-kaku-gothic-new/ZenKakuGothicNew-Regular.ttf', lazy=True)
                if language != 'ja' or not missing <= set(fallback.getBestCmap()):
                    raise ValueError(f'{filename}: no bundled fallback for {ranges(missing)}')
                fallback.close()
            original['labelFallbackCharacters'] = ranges(missing)
            chunks = [sorted(desired & mapping)]
        destination = output / ('enouia-text-sc' if rename else folder)
        destination.mkdir(parents=True, exist_ok=True)
        prefix = ('enouia-text-sc-' + weight) if rename else source.stem.replace('[wght]', '-300-600')
        for i, points in enumerate(chunks):
            if points:
                target = destination / f'{prefix}-{i:03d}.woff2'
                jobs.append((str(source), str(target), points, family, weight, rename, variable))
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        files = list(pool.map(generate, jobs))
    # Every original body UVS pair must survive in at least one corresponding face.
    for original in originals:
        if original['fullCharacterSet']:
            got = {tuple(pair) for file in files if file['family'] == original['family']
                   for pair in file['variationPairs']}
            if set(map(tuple, original['variationPairs'])) - got:
                raise ValueError('Lost original body variation sequence')
    css = ['/* Generated by scripts/subset-cjk-fonts.mjs. Do not edit. */']
    for file in files:
        css.append('@font-face{font-family:' + repr(file['family']) + ';font-style:normal;font-display:swap;font-weight:' + file['weight'] +
                   ";src:url('../assets/fonts/" + file['file'] + "?no-inline') format('woff2');unicode-range:" + file['unicodeRange'] + ';}')
    Path(args.css).write_text('\n'.join(css) + '\n', encoding='utf-8')
    manifest = {'fonttools': fontTools.__version__, 'bodySlicesPerWeight': 100, 'sources': originals, 'files': files}
    (output / 'cjk-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for family in dict.fromkeys(f['family'] for f in files):
        selected = [f for f in files if f['family'] == family]
        print(f"{family}: {len(selected)} WOFF2 files, {sum(f['bytes'] for f in selected):,} bytes", flush=True)


if __name__ == '__main__':
    main()
