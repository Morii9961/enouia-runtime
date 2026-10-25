// Star map · computes a layout off the page thread. It rebuilds the same generated
// field from (n, seed), so only two numbers go in and one position array comes out.
import { makeStarField } from './starfield';
import { layout, type LayoutId } from './starLayout';

self.onmessage = (e: MessageEvent<{ id: number; n: number; seed: number; layout: LayoutId }>) => {
  const { id, n, seed } = e.data;
  const t0 = performance.now();
  const pos = layout(makeStarField(n, seed), e.data.layout);
  (self as unknown as Worker).postMessage({ id, pos, ms: performance.now() - t0 }, [pos.buffer]);
};
