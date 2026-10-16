# Frontend source-map-js development patch

Date: 2026-10-16 (Asia/Shanghai). Baseline `dad92c0864a4fc76a7b82087f322f386ea5b9052`.

Installing the DOM test dependency exposed a pre-existing npm audit finding for development-only source-map-js 1.2.1. `npm explain source-map-js` confirmed Vite 8.3.1 → PostCSS 8.5.28 → source-map-js `^1.2.1`. The [maintainer's 1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) documents the indexed-source-map denial-of-service fix; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) identifies versions below 1.2.2 as affected.

`npm --prefix apps/desktop update source-map-js --ignore-scripts` changed only its version, registry URL and integrity in package-lock.json. It remains development-only, within PostCSS's existing range. package.json, direct versions, production dependencies, native source and Memory pin are unchanged. No broad audit-fix or framework upgrade was run.

Fresh verification passed: 95 frontend tests plus 56 actual-component DOM assertions, TypeScript/frontend build and desktop no-bundle release build, integration/dependency guards (eight + seven negatives), lockfile diff checks. `npm audit --json` reported an empty vulnerabilities object and zero known findings at this check. This is an audit snapshot, not a guarantee against all vulnerabilities. Unchanged native test/Clippy/format evidence is reused from the [preceding slice](Settings-exit-ownership-v1.md). No exploit workload, native acceptance, personal Vault, actual startup change, Provider call, Activity activation, installer or manual status snapshot was used. Owner files are preserved.
