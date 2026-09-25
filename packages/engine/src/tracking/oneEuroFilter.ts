/**
 * One Euro filter. Smooths noisy pose points when the person is still,
 * and stays responsive when they move.
 * https://gery.casiez.net/1euro/
 */
class LowPass {
  private value: number | undefined;

  filter(next: number, alpha: number): number {
    this.value = this.value === undefined ? next : alpha * next + (1 - alpha) * this.value;
    return this.value;
  }

  peek(): number | undefined {
    return this.value;
  }

  reset(): void {
    this.value = undefined;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  private readonly value = new LowPass();
  private readonly derivative = new LowPass();
  private lastTime: number | undefined;

  constructor(
    private readonly minCutoff = 1,
    private readonly beta = 0.5,
    private readonly derivativeCutoff = 1,
  ) {}

  filter(next: number, timestampMs: number): number {
    const time = timestampMs / 1000;
    if (this.lastTime === undefined) {
      this.lastTime = time;
      return this.value.filter(next, 1);
    }

    const dt = Math.max(time - this.lastTime, 1e-4);
    this.lastTime = time;
    const previous = this.value.peek() ?? next;
    const speed = (next - previous) / dt;
    const smoothedSpeed = this.derivative.filter(speed, alpha(this.derivativeCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedSpeed);
    return this.value.filter(next, alpha(cutoff, dt));
  }

  reset(): void {
    this.value.reset();
    this.derivative.reset();
    this.lastTime = undefined;
  }
}
