import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProviderConfigDraft, emptyProviderConfigDraft } from '../src/memory/providerSettingsDraft.ts';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/provider-settings-draft.json', import.meta.url), 'utf8'));
const valid = () => {
  const draft = emptyProviderConfigDraft();
  for (const destination of golden.destinations) draft.destinations[destination.api] = {
    enabled: true, model: destination.model, contextWindowTokens: String(destination.contextWindowTokens), maxOutputTokens: String(destination.maxOutputTokens),
    streaming: destination.streaming ? 'yes' : 'no', verifiedAt: destination.verifiedAt,
  };
  draft.maxAttemptsPerSession = String(golden.maxAttemptsPerSession);
  draft.maxReservedTokensPerSession = String(golden.maxReservedTokensPerSession);
  draft.verified = true;
  return draft;
};
const issue = (draft, field) => {
  const result = buildProviderConfigDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.field === field), JSON.stringify(result));
  assert.equal(result.json, undefined);
};

test('configuration starts blank with no inferred API, capabilities, limits or verification', () => {
  const draft = emptyProviderConfigDraft();
  assert.deepEqual(draft.destinations.openai, draft.destinations.anthropic);
  assert.notEqual(draft.destinations.openai, draft.destinations.anthropic);
  assert.equal(draft.destinations.openai.enabled, false);
  assert.equal(draft.destinations.openai.streaming, '');
  assert.equal(draft.destinations.openai.verifiedAt, '');
  issue(draft, 'destinations');
  issue(draft, 'verified');
});

test('verified draft matches the same non-secret file the native parser tests consume', () => {
  const draft = valid(), before = structuredClone(draft), result = buildProviderConfigDraft(draft);
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings, golden);
  assert.deepEqual(JSON.parse(result.json), golden);
  assert.ok(result.json.endsWith('\n'));
  assert.deepEqual(draft, before);
});

test('disabled providers and unrecognized properties cannot enter a generated settings file', () => {
  const draft = valid();
  draft.destinations.anthropic = { enabled: false, model: '', contextWindowTokens: '', maxOutputTokens: '', streaming: '', verifiedAt: '' };
  draft.apiKey = 'synthetic-key-sentinel';
  draft.destinations.openai.apiKey = 'synthetic-destination-secret';
  draft.destinations.other = { enabled: true, model: 'unexpected' };
  const result = buildProviderConfigDraft(draft);
  assert.equal(result.ok, true);
  assert.equal(result.settings.destinations.length, 1);
  assert.doesNotMatch(result.json, /apiKey|synthetic-key-sentinel|synthetic-destination-secret|unexpected|other/);
});

test('model IDs retain the pinned ASCII alphabet and 160-byte limit without trimming', () => {
  for (const model of ['a', 'Model-_.:09', 'a'.repeat(160)]) {
    const draft = valid(); draft.destinations.openai.model = model;
    assert.equal(buildProviderConfigDraft(draft).ok, true, model);
  }
  for (const model of ['', 'a'.repeat(161), ' model', 'model ', 'model\n', 'model/name', '模型', 'a😀']) {
    const draft = valid(); draft.destinations.openai.model = model;
    issue(draft, 'openai.model');
  }
});

test('numeric drafts refuse fractions, signs, exponents, whitespace and lost integer precision', () => {
  for (const value of ['', '0', '-1', '+1', '1.5', '1e5', ' 10', '10 ', 'Infinity', '9007199254740992']) {
    const draft = valid(); draft.maxReservedTokensPerSession = value;
    issue(draft, 'maxReservedTokensPerSession');
    draft.maxReservedTokensPerSession = '100000'; draft.destinations.openai.contextWindowTokens = value;
    issue(draft, 'openai.contextWindowTokens');
  }
  const draft = valid(); draft.maxReservedTokensPerSession = '9007199254740991';
  assert.equal(buildProviderConfigDraft(draft).ok, true);
});

test('session attempts and per-model output limits retain cross-field boundaries', () => {
  const draft = valid(); draft.maxAttemptsPerSession = '1000';
  assert.equal(buildProviderConfigDraft(draft).ok, true);
  draft.maxAttemptsPerSession = '1001'; issue(draft, 'maxAttemptsPerSession');
  draft.maxAttemptsPerSession = '10';
  for (const output of ['0', '128000', '128001']) {
    draft.destinations.openai.maxOutputTokens = output; issue(draft, 'openai.maxOutputTokens');
  }
});

test('verification timestamps preserve exact native UTC-millisecond and calendar rules', () => {
  for (const value of ['2028-02-29T23:59:59.999Z', '0000-01-01T00:00:00.000Z']) {
    const draft = valid(); draft.destinations.openai.verifiedAt = value;
    assert.equal(buildProviderConfigDraft(draft).ok, true, value);
  }
  for (const value of ['2026-02-29T00:00:00.000Z', '2026-04-31T00:00:00.000Z', '2026-10-18T24:00:00.000Z', '2026-10-18T00:00:60.000Z', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00.000+00:00', '2026-10-18', ' 2026-10-18T00:00:00.000Z']) {
    const draft = valid(); draft.destinations.openai.verifiedAt = value;
    issue(draft, 'openai.verifiedAt');
  }
});

test('streaming and owner verification require explicit choices before any output exists', () => {
  const draft = valid(); draft.destinations.openai.streaming = '';
  issue(draft, 'openai.streaming');
  draft.destinations.openai.streaming = 'no'; draft.verified = false;
  issue(draft, 'verified');
});
