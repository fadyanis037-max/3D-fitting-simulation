import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { BodyJoints } from "./joints";

export interface AvatarRig {
  torso: Object3D;
  leftUpperArm: Object3D;
  rightUpperArm: Object3D;
  leftForearm: Object3D;
  rightForearm: Object3D;
  head: Object3D;
}

const Y_AXIS = new Vector3(0, 1, 0);

/** Points each garment bone along the tracked body and sizes it to that person. */
export class RigSolver {
  private readonly delta = new Vector3();
  private readonly across = new Vector3();
  private readonly up = new Vector3();
  private readonly forward = new Vector3();
  private readonly basis = new Matrix4();
  private readonly quat = new Quaternion();

  apply(rig: AvatarRig, joints: BodyJoints): void {
    const shoulderWidth = Math.max(joints.leftShoulder.distanceTo(joints.rightShoulder), 1e-3);
    this.orientTorso(rig.torso, joints.hips, joints.shoulderMid, joints.rightShoulder, joints.leftShoulder, shoulderWidth);
    this.aim(rig.leftUpperArm, joints.leftShoulder, joints.leftElbow, shoulderWidth, joints.leftElbowVisible);
    this.aim(rig.rightUpperArm, joints.rightShoulder, joints.rightElbow, shoulderWidth, joints.rightElbowVisible);
    this.aim(rig.leftForearm, joints.leftElbow, joints.leftWrist, shoulderWidth, joints.leftElbowVisible && joints.leftWristVisible);
    this.aim(rig.rightForearm, joints.rightElbow, joints.rightWrist, shoulderWidth, joints.rightElbowVisible && joints.rightWristVisible);
    this.placeHead(rig.head, joints, shoulderWidth);
  }

  private orientTorso(
    bone: Object3D,
    hips: Vector3,
    neck: Vector3,
    rightShoulder: Vector3,
    leftShoulder: Vector3,
    thickness: number,
  ): void {
    this.up.subVectors(neck, hips);
    const length = this.up.length();
    if (length < 1e-4) {
      bone.visible = false;
      return;
    }
    this.up.multiplyScalar(1 / length);
    this.across.subVectors(leftShoulder, rightShoulder);
    this.across.addScaledVector(this.up, -this.across.dot(this.up));
    if (this.across.lengthSq() < 1e-8) {
      bone.visible = false;
      return;
    }
    this.across.normalize();
    this.forward.crossVectors(this.across, this.up).normalize();
    this.basis.makeBasis(this.across, this.up, this.forward);
    this.quat.setFromRotationMatrix(this.basis);
    bone.position.copy(hips);
    bone.quaternion.copy(this.quat);
    bone.scale.set(thickness, length, thickness);
    bone.visible = true;
  }

  private aim(bone: Object3D, origin: Vector3, target: Vector3, thickness: number, visible: boolean): void {
    if (!visible) {
      bone.visible = false;
      return;
    }
    this.delta.subVectors(target, origin);
    const length = this.delta.length();
    if (length < 1e-4) {
      bone.visible = false;
      return;
    }
    this.delta.multiplyScalar(1 / length);
    bone.position.copy(origin);
    bone.quaternion.copy(this.quaternionFromY(this.delta));
    bone.scale.set(thickness, length, thickness);
    bone.visible = true;
  }

  private placeHead(bone: Object3D, joints: BodyJoints, shoulderWidth: number): void {
    if (joints.noseVisible) {
      bone.position.copy(joints.nose);
    } else {
      bone.position.copy(joints.shoulderMid);
      bone.position.y += shoulderWidth * 0.35;
    }
    bone.scale.setScalar(shoulderWidth);
    bone.visible = true;
  }

  private quaternionFromY(direction: Vector3): Quaternion {
    if (direction.dot(Y_AXIS) < -0.9999) {
      this.quat.set(1, 0, 0, 0);
      return this.quat;
    }
    return this.quat.setFromUnitVectors(Y_AXIS, direction);
  }
}
