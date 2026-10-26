// The accessible name of the Vault's way into the synthetic preview. It repeats fixture.ts's AUTO_ENTRY on purpose:
// importing the fixture here would pull all of it into the main script, and the preview loads on demand.
// fixture.ts is data and is not edited, so keep this string equal to its AUTO_ENTRY.
import { msg } from '../../i18n/index.ts';

export const AUTO_ENTRY = msg('Automatic memory · synthetic preview');
