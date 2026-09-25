import type { Landmark, PoseDelegate, WorkerResponse } from "../types";
import { PoseSmoother } from "./poseSmoother";

export interface TrackedPose {
  landmarks: Landmark[];
  worldLandmarks: Landmark[] | null;
  timestamp: number;
}

export class PoseTracker {
  private readonly worker: Worker;
  private readonly imageSmoother = new PoseSmoother();
  private readonly worldSmoother = new PoseSmoother();
  private readonly ready: Promise<PoseDelegate>;
  private resolveReady: ((delegate: PoseDelegate) => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private inFlight = false;
  private disposed = false;
  private samples = 0;

  constructor(
    private readonly onPose: (pose: TrackedPose | null) => void,
    private readonly onError: (message: string) => void,
  ) {
    this.worker = new Worker(new URL("./poseWorker.ts", import.meta.url), { type: "module" });
    this.ready = new Promise<PoseDelegate>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        this.resolveReady?.(message.delegate);
        this.resolveReady = null;
        this.rejectReady = null;
        return;
      }
      if (message.type === "error") {
        this.inFlight = false;
        if (this.rejectReady) {
          this.rejectReady(new Error(message.message));
          this.resolveReady = null;
          this.rejectReady = null;
        }
        this.onError(message.message);
        return;
      }

      this.inFlight = false;
      this.samples += 1;
      if (!message.landmarks) {
        this.imageSmoother.reset();
        this.worldSmoother.reset();
        this.onPose(null);
        return;
      }
      this.onPose({
        landmarks: this.imageSmoother.smooth(message.landmarks, message.timestamp),
        worldLandmarks: message.worldLandmarks
          ? this.worldSmoother.smooth(message.worldLandmarks, message.timestamp)
          : null,
        timestamp: message.timestamp,
      });
    };

    this.worker.onerror = () => {
      const message = "The tracking worker failed to start.";
      this.rejectReady?.(new Error(message));
      this.resolveReady = null;
      this.rejectReady = null;
      this.onError(message);
    };
  }

  /** How many camera frames the pose model has answered since the last read. */
  takeSamples(): number {
    const count = this.samples;
    this.samples = 0;
    return count;
  }

  init(): Promise<PoseDelegate> {
    return this.ready;
  }

  submit(video: HTMLVideoElement, timestamp: number): void {
    if (this.inFlight || this.disposed || video.readyState < 2 || video.videoWidth === 0) return;
    this.inFlight = true;
    createImageBitmap(video)
      .then((bitmap) => {
        if (this.disposed) {
          bitmap.close();
          return;
        }
        this.worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
      })
      .catch(() => {
        this.inFlight = false;
      });
  }

  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
  }
}
