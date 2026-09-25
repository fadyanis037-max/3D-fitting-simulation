import type { Landmark } from "../types";
import { POSE } from "../types";

/** A front-facing standing body, used to show the jacket before the camera is on. */
export function standingLandmarks(): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));

  const place = (index: number, x: number, y: number, z = 0): void => {
    landmarks[index] = { x, y, z, visibility: 1 };
  };

  place(POSE.nose, 0.5, 0.18);
  place(POSE.leftShoulder, 0.61, 0.24);
  place(POSE.rightShoulder, 0.39, 0.24);
  place(POSE.leftElbow, 0.74, 0.46, -0.02);
  place(POSE.rightElbow, 0.26, 0.46, -0.02);
  place(POSE.leftWrist, 0.78, 0.66);
  place(POSE.rightWrist, 0.22, 0.66);
  place(POSE.leftHip, 0.56, 0.76);
  place(POSE.rightHip, 0.44, 0.76);
  return landmarks;
}
