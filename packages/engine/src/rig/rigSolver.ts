import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { BodyJoints } from "./joints";

export interface AvatarRig {
  root: Object3D;
  modelShoulderWidth: number;
  torso: Object3D;
  leftUpperArm: Object3D;
  rightUpperArm: Object3D;
  leftForearm: Object3D;
  rightForearm: Object3D;
  head: Object3D;
}

const Y_AXIS = new Vector3(0, 1, 0);
const BLEND = 0.65;
const SCALE_SAMPLES = 18;

/** Rotates a fixed-size jacket. Screen position and one scale come from the image. */
export class RigSolver {
  private readonly up = new Vector3();
  private readonly across = new Vector3();
  private readonly forward = new Vector3();
  private readonly basis = new Matrix4();
  private readonly aim = new Quaternion();
  private readonly local = new Quaternion();
  private readonly upperWorld = new Quaternion();
  private readonly headLocal = new Vector3();
  private scaleSum = 0;
  private scaleCount = 0;
  private lockedScale: number | null = null;

  apply(rig: AvatarRig, joints: BodyJoints, freezeScale: boolean): void {
    const scale = this.resolveScale(joints.shoulderWidth / rig.modelShoulderWidth, freezeScale);
    rig.root.position.copy(joints.hips);
    rig.root.quaternion.identity();
    rig.root.scale.setScalar(scale);
    this.orientTorso(rig.torso, joints);
    this.aimLocal(rig.leftUpperArm, rig.torso.quaternion, joints.leftUpperDir, joints.leftUpperValid);
    this.aimLocal(rig.rightUpperArm, rig.torso.quaternion, joints.rightUpperDir, joints.rightUpperValid);
    this.upperWorld.copy(rig.torso.quaternion).multiply(rig.leftUpperArm.quaternion);
    this.aimLocal(rig.leftForearm, this.upperWorld, joints.leftForeDir, joints.leftForeValid);
    this.upperWorld.copy(rig.torso.quaternion).multiply(rig.rightUpperArm.quaternion);
    this.aimLocal(rig.rightForearm, this.upperWorld, joints.rightForeDir, joints.rightForeValid);
    this.placeHead(rig.head, joints, scale);
  }

  private resolveScale(scale: number, freeze: boolean): number {
    if (!freeze) return scale;
    if (this.lockedScale !== null) return this.lockedScale;
    this.scaleSum += scale;
    this.scaleCount += 1;
    const average = this.scaleSum / this.scaleCount;
    if (this.scaleCount >= SCALE_SAMPLES) this.lockedScale = average;
    return average;
  }

  private orientTorso(bone: Object3D, joints: BodyJoints): void {
    this.up.copy(joints.spine);
    if (this.up.lengthSq() < 1e-6) return;
    this.up.normalize();
    this.across.copy(joints.across);
    this.across.addScaledVector(this.up, -this.across.dot(this.up));
    if (this.across.lengthSq() < 1e-8) return;
    this.across.normalize();
    this.forward.crossVectors(this.across, this.up).normalize();
    this.basis.makeBasis(this.across, this.up, this.forward);
    this.aim.setFromRotationMatrix(this.basis);
    bone.quaternion.slerp(this.aim, BLEND);
  }

  private aimLocal(bone: Object3D, parentQuat: Quaternion, direction: Vector3, valid: boolean): void {
    if (!valid) return;
    this.quaternionFromY(direction);
    this.local.copy(parentQuat).invert().multiply(this.aim);
    bone.quaternion.slerp(this.local, BLEND);
  }

  private placeHead(head: Object3D, joints: BodyJoints, scale: number): void {
    if (joints.noseVisible) this.headLocal.copy(joints.nose);
    else {
      this.headLocal.copy(joints.shoulderMid);
      this.headLocal.y += joints.shoulderWidth * 0.35;
    }
    this.headLocal.sub(joints.hips).divideScalar(scale);
    head.position.copy(this.headLocal);
  }

  private quaternionFromY(direction: Vector3): void {
    if (direction.dot(Y_AXIS) < -0.9999) {
      this.aim.set(1, 0, 0, 0);
      return;
    }
    this.aim.setFromUnitVectors(Y_AXIS, direction);
  }
}
