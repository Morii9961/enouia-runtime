// Star map · computes a layout off the page thread. It rebuilds the same generated
// field from (n, seed), so only two numbers (and, for the force layout, where the
// stars are now) go in and position arrays come out. With `stream` the force layout
// is sent while it settles, about 70 frames over a little more than a second, so the
// page can show it moving; `ms` counts only the time spent computing.
import { makeStarField } from './starfield';
import { forceSim, layout, type LayoutId } from './starLayout';

type Ask = { id: number; n: number; seed: number; layout: LayoutId; start?: Float32Array; stream?: boolean };
const post = (msg: { id: number; pos: Float32Array; ms: number; done: boolean }) => (self as unknown as Worker).postMessage(msg, [msg.pos.buffer]);

self.onmessage = (e: MessageEvent<Ask>) => {
  const { id, n, seed, start, stream } = e.data;
  const t0 = performance.now();
  const f = makeStarField(n, seed);
  if (e.data.layout !== 'force') { const pos = layout(f, e.data.layout); post({ id, pos, ms: performance.now() - t0, done: true }); return; }
  const sim = forceSim(f, start);
  const per = stream ? Math.max(1, Math.ceil(sim.iterations / 72)) : sim.iterations;
  let ms = performance.now() - t0;
  const slice = () => {
    const t1 = performance.now(); sim.step(per); const pos = sim.positions(); ms += performance.now() - t1;
    const done = sim.done(); post({ id, pos, ms, done });
    if (!done) setTimeout(slice, 16);
  };
  slice();
};
