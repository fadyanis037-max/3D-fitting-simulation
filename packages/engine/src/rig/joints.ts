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
  shoulderWidth: number;
  spine: Vector3;
  across: Vector3;
  leftUpperDir: Vector3;
  leftForeDir: Vector3;
  rightUpperDir: Vector3;
  rightForeDir: Vector3;
  leftElbowVisible: boolean;
  rightElbowVisible: boolean;
  leftWristVisible: boolean;
  rightWristVisible: boolean;
  leftUpperValid: boolean;
  leftForeValid: boolean;
  rightUpperValid: boolean;
  rightForeValid: boolean;
  noseVisible: boolean;
}

/**
 * Image x/y land on the video. World landmarks supply bone directions:
 * +X matches image right, +Y is up, and negative world Z is toward the camera.
 */
function placeOnScreen(landmark: Landmark, aspect: number, target: Vector3): void {
  target.set((landmark.x - 0.5) * 2 * aspect, (0.5 - landmark.y) * 2, 0);
}

function worldToView(landmark: Landmark, target: Vector3): void {
  target.set(landmark.x, -landmark.y, -landmark.z);
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
    shoulderWidth: 0,
    spine: new Vector3(),
    across: new Vector3(),
    leftUpperDir: new Vector3(),
    leftForeDir: new Vector3(),
    rightUpperDir: new Vector3(),
    rightForeDir: new Vector3(),
    leftElbowVisible: false,
    rightElbowVisible: false,
    leftWristVisible: false,
    rightWristVisible: false,
    leftUpperValid: false,
    leftForeValid: false,
    rightUpperValid: false,
    rightForeValid: false,
    noseVisible: false,
  };

  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly worldHips = new Vector3();
  private readonly worldLeftShoulder = new Vector3();
  private readonly worldRightShoulder = new Vector3();
  private readonly worldShoulderMid = new Vector3();

  update(landmarks: Landmark[], worldLandmarks: Landmark[] | null, aspect: number): BodyJoints | null {
    if (landmarks.length < 25) return null;
    if (!this.visible(landmarks, POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip)) {
      return null;
    }

    const joints = this.joints;
    placeOnScreen(landmarks[POSE.leftHip], aspect, joints.leftHip);
    placeOnScreen(landmarks[POSE.rightHip], aspect, joints.rightHip);
    placeOnScreen(landmarks[POSE.leftShoulder], aspect, joints.leftShoulder);
    placeOnScreen(landmarks[POSE.rightShoulder], aspect, joints.rightShoulder);
    joints.hips.copy(joints.leftHip).add(joints.rightHip).multiplyScalar(0.5);
    joints.shoulderMid.copy(joints.leftShoulder).add(joints.rightShoulder).multiplyScalar(0.5);
    joints.shoulderWidth = Math.max(joints.leftShoulder.distanceTo(joints.rightShoulder), 1e-3);

    joints.leftElbowVisible = this.visible(landmarks, POSE.leftElbow);
    joints.rightElbowVisible = this.visible(landmarks, POSE.rightElbow);
    joints.leftWristVisible = this.visible(landmarks, POSE.leftWrist);
    joints.rightWristVisible = this.visible(landmarks, POSE.rightWrist);
    joints.noseVisible = this.visible(landmarks, POSE.nose);

    if (joints.leftElbowVisible) placeOnScreen(landmarks[POSE.leftElbow], aspect, joints.leftElbow);
    if (joints.rightElbowVisible) placeOnScreen(landmarks[POSE.rightElbow], aspect, joints.rightElbow);
    if (joints.leftWristVisible) placeOnScreen(landmarks[POSE.leftWrist], aspect, joints.leftWrist);
    if (joints.rightWristVisible) placeOnScreen(landmarks[POSE.rightWrist], aspect, joints.rightWrist);
    if (joints.noseVisible) placeOnScreen(landmarks[POSE.nose], aspect, joints.nose);

    this.orient(worldLandmarks);
    joints.leftUpperValid = this.limbDirection(
      landmarks,
      worldLandmarks,
      POSE.leftShoulder,
      POSE.leftElbow,
      aspect,
      joints.leftUpperDir,
    );
    joints.rightUpperValid = this.limbDirection(
      landmarks,
      worldLandmarks,
      POSE.rightShoulder,
      POSE.rightElbow,
      aspect,
      joints.rightUpperDir,
    );
    joints.leftForeValid =
      joints.leftUpperValid &&
      this.limbDirection(landmarks, worldLandmarks, POSE.leftElbow, POSE.leftWrist, aspect, joints.leftForeDir);
    joints.rightForeValid =
      joints.rightUpperValid &&
      this.limbDirection(landmarks, worldLandmarks, POSE.rightElbow, POSE.rightWrist, aspect, joints.rightForeDir);

    return joints;
  }

  private orient(worldLandmarks: Landmark[] | null): void {
    const joints = this.joints;
    if (worldLandmarks && worldLandmarks.length > POSE.rightHip) {
      worldToView(worldLandmarks[POSE.leftHip], this.worldHips);
      worldToView(worldLandmarks[POSE.rightHip], this.to);
      this.worldHips.add(this.to).multiplyScalar(0.5);
      worldToView(worldLandmarks[POSE.leftShoulder], this.worldLeftShoulder);
      worldToView(worldLandmarks[POSE.rightShoulder], this.worldRightShoulder);
      this.worldShoulderMid.copy(this.worldLeftShoulder).add(this.worldRightShoulder).multiplyScalar(0.5);
      joints.spine.subVectors(this.worldShoulderMid, this.worldHips);
      joints.across.subVectors(this.worldLeftShoulder, this.worldRightShoulder);
    } else {
      joints.spine.subVectors(joints.shoulderMid, joints.hips);
      joints.across.subVectors(joints.leftShoulder, joints.rightShoulder);
    }
    if (joints.spine.lengthSq() > 1e-8) joints.spine.normalize();
    if (joints.across.lengthSq() > 1e-8) joints.across.normalize();
  }

  private limbDirection(
    landmarks: Landmark[],
    worldLandmarks: Landmark[] | null,
    fromIndex: number,
    toIndex: number,
    aspect: number,
    target: Vector3,
  ): boolean {
    if (!this.visible(landmarks, fromIndex, toIndex)) return false;
    if (worldLandmarks && worldLandmarks.length > toIndex) {
      worldToView(worldLandmarks[fromIndex], this.from);
      worldToView(worldLandmarks[toIndex], this.to);
    } else {
      placeOnScreen(landmarks[fromIndex], aspect, this.from);
      placeOnScreen(landmarks[toIndex], aspect, this.to);
    }
    target.subVectors(this.to, this.from);
    if (target.lengthSq() < 1e-8) return false;
    target.normalize();
    return true;
  }

  private visible(landmarks: Landmark[], ...indices: number[]): boolean {
    return indices.every((index) => (landmarks[index]?.visibility ?? 0) >= MIN_VISIBILITY);
  }
}
