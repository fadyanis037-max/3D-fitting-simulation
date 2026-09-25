import type { Landmark } from "../types";
import { OneEuroFilter } from "./oneEuroFilter";

const GAP_RESET_MS = 400;

export class PoseSmoother {
  private readonly filters: OneEuroFilter[] = [];
  private lastTimestamp = 0;

  smooth(landmarks: Landmark[], timestamp: number): Landmark[] {
    if (this.lastTimestamp !== 0 && timestamp - this.lastTimestamp > GAP_RESET_MS) {
      this.reset();
    }
    this.lastTimestamp = timestamp;

    return landmarks.map((landmark, index) => ({
      x: this.filterAt(index * 3).filter(landmark.x, timestamp),
      y: this.filterAt(index * 3 + 1).filter(landmark.y, timestamp),
      z: this.filterAt(index * 3 + 2).filter(landmark.z, timestamp),
      visibility: landmark.visibility,
    }));
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.lastTimestamp = 0;
  }

  private filterAt(index: number): OneEuroFilter {
    let filter = this.filters[index];
    if (!filter) {
      filter = new OneEuroFilter(1.1, 0.45, 1);
      this.filters[index] = filter;
    }
    return filter;
  }
}
