import ipa from '../assets/fonts/enouia-text-sc/LICENSE.md?raw';
import sarasa from '../assets/fonts/sarasa-mono-sc/OFL.txt?raw';
import mplus from '../assets/fonts/m-plus-1-code/OFL.txt?raw';
import zen from '../assets/fonts/zen-kaku-gothic-new/OFL.txt?raw';
import { t } from '../i18n/index.ts';
import '../theme/cjk-faces.css';

export default function FontLicences() {
  return <div className="font-licences">
    <p>{t('Font licences are reproduced verbatim in their original languages. Use of Enouia Text SC is subject to IPA Font License 1.0.')}</p>
    {[
      ['Enouia Text SC · IPA Font License 1.0', ipa],
      ['Sarasa Mono SC · OFL-1.1', sarasa],
      ['M PLUS 1 Code · OFL-1.1', mplus],
      ['Zen Kaku Gothic New · OFL-1.1', zen],
    ].map(([name, text]) => <details key={name}><summary>{name}</summary><pre lang={name.startsWith('Enouia') ? 'ja' : 'en'}>{text}</pre></details>)}
  </div>;
}
