# Synthetic segmented catalog fixtures

`input.json` and `source.json` are copied from Memory's public `tests/fixtures/ui-records/` at exact revision `0d338f12f51a859363e0725071bcf43874b492c7`. They supply the frozen UI-v2 record-field shape. The native fixture replaces identities, source text/hash/quotes, attribution, policy, language and time metadata before capture/admission; clears conversation/entity references and annotations; and creates only three fixed fictional examples.

The descriptor, policy and attention-profile templates are shared with `../core8/`, with a new `SegmentedV1` descriptor and a separate fresh native root. No old HostV2 root is opened, converted or reused. No Provider, analyzer, Owner enrollment, queued capture or formation worker is used.
