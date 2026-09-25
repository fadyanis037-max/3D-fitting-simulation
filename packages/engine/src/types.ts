export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type PoseDelegate = "GPU" | "CPU";

/** Live body model. Heavy is the accuracy trial; Full or Lite if this cannot hold ~30 pose updates a second. */
export const POSE_MODEL = {
  name: "Heavy",
  url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
} as const;

export interface WorkerFrameMessage {
  type: "frame";
  bitmap: ImageBitmap;
  timestamp: number;
}

export type WorkerResponse =
  | { type: "ready"; delegate: PoseDelegate }
  | { type: "error"; message: string }
  | {
      type: "result";
      timestamp: number;
      landmarks: Landmark[] | null;
      worldLandmarks: Landmark[] | null;
    };

export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;
