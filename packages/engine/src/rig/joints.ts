import { Vector3 } from "three";
import type { Landmark } from "../types";
import { POSE } from "../types";

const MIN_VISIBILITY = 0.5;

export interface BodyJoints {
  hips: Vector3;
  leftHip: Vector3;
  rightHip: Vector3;
  shoulderMid: Vector3;
  leftShoulder: Vector3;
  rightShoulder: Vector3;
  leftElbow: Vector3;
  rightElbow: Vector3;
  leftWrist: Vector3;
  rightWrist: Vector3;
  nose: Vector3;
  leftElbowVisible: boolean;
  rightElbowVisible: boolean;
  leftWristVisible: boolean;
  rightWristVisible: boolean;
  noseVisible: boolean;
}

/**
 * Maps a camera landmark into the view.
 * x and y fill an orthographic frame that matches the video.
 * MediaPipe z gets smaller as a point gets closer to the camera, so it is flipped.
 */
export function landmarkToView(landmark: Landmark, aspect: number, target: Vector3): void {
  target.set((landmark.x - 0.5) * 2 * aspect, (0.5 - landmark.y) * 2, -landmark.z * 2 * aspect);
}

export class JointExtractor {
  readonly joints: BodyJoints = {
    hips: new Vector3(),
    leftHip: new Vector3(),
    rightHip: new Vector3(),
    shoulderMid: new Vector3(),
    leftShoulder: new Vector3(),
    rightShoulder: new Vector3(),
    leftElbow: new Vector3(),
    rightElbow: new Vector3(),
    leftWrist: new Vector3(),
    rightWrist: new Vector3(),
    nose: new Vector3(),
    leftElbowVisible: false,
    rightElbowVisible: false,
    leftWristVisible: false,
    rightWristVisible: false,
    noseVisible: false,
  };

  update(landmarks: Landmark[], aspect: number): BodyJoints | null {
    if (landmarks.length < 25) return null;
    if (!this.visible(landmarks, POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip)) {
      return null;
    }

    const joints = this.joints;
    landmarkToView(landmarks[POSE.leftHip], aspect, joints.leftHip);
    landmarkToView(landmarks[POSE.rightHip], aspect, joints.rightHip);
    landmarkToView(landmarks[POSE.leftShoulder], aspect, joints.leftShoulder);
    landmarkToView(landmarks[POSE.rightShoulder], aspect, joints.rightShoulder);
    joints.hips.copy(joints.leftHip).add(joints.rightHip).multiplyScalar(0.5);
    joints.shoulderMid.copy(joints.leftShoulder).add(joints.rightShoulder).multiplyScalar(0.5);

    joints.leftElbowVisible = this.visible(landmarks, POSE.leftElbow);
    joints.rightElbowVisible = this.visible(landmarks, POSE.rightElbow);
    joints.leftWristVisible = this.visible(landmarks, POSE.leftWrist);
    joints.rightWristVisible = this.visible(landmarks, POSE.rightWrist);
    joints.noseVisible = this.visible(landmarks, POSE.nose);

    if (joints.leftElbowVisible) landmarkToView(landmarks[POSE.leftElbow], aspect, joints.leftElbow);
    if (joints.rightElbowVisible) landmarkToView(landmarks[POSE.rightElbow], aspect, joints.rightElbow);
    if (joints.leftWristVisible) landmarkToView(landmarks[POSE.leftWrist], aspect, joints.leftWrist);
    if (joints.rightWristVisible) landmarkToView(landmarks[POSE.rightWrist], aspect, joints.rightWrist);
    if (joints.noseVisible) landmarkToView(landmarks[POSE.nose], aspect, joints.nose);

    return joints;
  }

  private visible(landmarks: Landmark[], ...indices: number[]): boolean {
    return indices.every((index) => (landmarks[index]?.visibility ?? 0) >= MIN_VISIBILITY);
  }
}
