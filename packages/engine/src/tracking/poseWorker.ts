import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, PoseDelegate, WorkerFrameMessage, WorkerResponse } from "../types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const MAX_FRAME_WIDTH = 640;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerFrameMessage>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

let landmarker: PoseLandmarker | null = null;
let lastTimestamp = -1;
let frameCanvas: OffscreenCanvas | null = null;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Could not start body tracking.";
}

function copyLandmarks(source: Array<{ x: number; y: number; z: number; visibility?: number }> | undefined): Landmark[] | null {
  if (!source || source.length === 0) return null;
  return source.map((landmark) => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility ?? 0,
  }));
}

function frameSource(bitmap: ImageBitmap): OffscreenCanvas | ImageBitmap {
  const scale = Math.min(1, MAX_FRAME_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (!frameCanvas || frameCanvas.width !== width || frameCanvas.height !== height) {
    frameCanvas = new OffscreenCanvas(width, height);
  }
  const context = frameCanvas.getContext("2d");
  if (!context) return bitmap;
  context.drawImage(bitmap, 0, 0, width, height);
  return frameCanvas;
}

async function createLandmarker(): Promise<PoseDelegate> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE, true);
  const delegates: PoseDelegate[] = ["GPU", "CPU"];
  let lastError: unknown;

  for (const delegate of delegates) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate,
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      return delegate;
    } catch (error) {
      lastError = error;
      landmarker = null;
    }
  }

  throw new Error(describe(lastError));
}

scope.onmessage = (event) => {
  const message = event.data;
  if (!landmarker || message.type !== "frame") return;

  const bitmap = message.bitmap;
  try {
    let timestamp = Math.round(message.timestamp);
    if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
    lastTimestamp = timestamp;

    const result = landmarker.detectForVideo(frameSource(bitmap), timestamp);
    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks[0];
    scope.postMessage({
      type: "result",
      timestamp,
      landmarks: copyLandmarks(landmarks),
      worldLandmarks: copyLandmarks(worldLandmarks),
    });
  } catch (error) {
    scope.postMessage({ type: "error", message: describe(error) });
  } finally {
    bitmap.close();
  }
};

createLandmarker().then(
  (delegate) => scope.postMessage({ type: "ready", delegate }),
  (error: unknown) => scope.postMessage({ type: "error", message: describe(error) }),
);
