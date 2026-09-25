import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import type { BodyJoints } from "../rig/joints";
import type { AvatarRig } from "../rig/rigSolver";

const DEBUG_PAIRS: Array<[keyof BodyJoints, keyof BodyJoints]> = [
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftShoulder"],
  ["rightHip", "rightShoulder"],
];

function limb(
  radiusTop: number,
  radiusBottom: number,
  material: MeshStandardMaterial | MeshBasicMaterial,
  length = 1,
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radiusTop, radiusBottom, length, 28), material);
  mesh.position.y = 0.5;
  mesh.frustumCulled = false;
  return mesh;
}

/** Jacket meshes plus an invisible body that hides cloth behind the arms and head. */
export class Avatar {
  readonly root = new Group();
  readonly rig: AvatarRig;
  private readonly debugPositions: Float32Array;
  private readonly debugAttribute: BufferAttribute;
  private readonly debugLines: LineSegments;
  private showSkeleton = false;

  constructor() {
    const cloth = new MeshStandardMaterial({
      color: 0x3c5f9a,
      roughness: 0.72,
      metalness: 0.02,
      emissive: 0x14233f,
      emissiveIntensity: 0.55,
      side: DoubleSide,
    });
    const occluder = new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });

    const torso = new Group();
    const jacketTorso = limb(0.58, 0.4, cloth);
    const bodyTorso = limb(0.4, 0.28, occluder, 0.86);
    jacketTorso.renderOrder = 1;
    bodyTorso.renderOrder = 0;
    torso.add(bodyTorso, jacketTorso);

    const leftUpperArm = new Group();
    const rightUpperArm = new Group();
    for (const arm of [leftUpperArm, rightUpperArm]) {
      const sleeve = limb(0.16, 0.12, cloth);
      const armBody = limb(0.1, 0.08, occluder, 0.82);
      const cuff = new Mesh(new CircleGeometry(0.12, 24), cloth);
      cuff.rotation.x = -Math.PI / 2;
      cuff.position.y = 1.01;
      cuff.renderOrder = 1;
      cuff.frustumCulled = false;
      sleeve.renderOrder = 1;
      armBody.renderOrder = 0;
      arm.add(armBody, sleeve, cuff);
    }

    const leftForearm = new Group();
    const rightForearm = new Group();
    for (const arm of [leftForearm, rightForearm]) {
      const forearm = limb(0.09, 0.075, occluder, 0.9);
      forearm.renderOrder = 0;
      arm.add(forearm);
    }

    const head = new Group();
    const skull = new Mesh(new SphereGeometry(0.24, 20, 16), occluder);
    skull.renderOrder = 0;
    skull.frustumCulled = false;
    head.add(skull);

    this.rig = { torso, leftUpperArm, rightUpperArm, leftForearm, rightForearm, head };
    this.root.add(torso, leftUpperArm, rightUpperArm, leftForearm, rightForearm, head);

    this.debugPositions = new Float32Array(DEBUG_PAIRS.length * 2 * 3);
    const geometry = new BufferGeometry();
    this.debugAttribute = new BufferAttribute(this.debugPositions, 3);
    geometry.setAttribute("position", this.debugAttribute);
    this.debugLines = new LineSegments(
      geometry,
      new LineBasicMaterial({ color: 0x9be7a8, depthTest: false }),
    );
    this.debugLines.frustumCulled = false;
    this.debugLines.visible = false;
    this.debugLines.renderOrder = 2;
    this.root.add(this.debugLines);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  setShowSkeleton(show: boolean): void {
    this.showSkeleton = show;
    this.debugLines.visible = show && this.root.visible;
  }

  updateDebug(joints: BodyJoints): void {
    if (!this.showSkeleton) return;
    let offset = 0;
    for (const [startName, endName] of DEBUG_PAIRS) {
      const from = joints[startName] as Vector3Like;
      const to = this.pairVisible(joints, startName, endName) ? (joints[endName] as Vector3Like) : from;
      this.debugPositions[offset++] = from.x;
      this.debugPositions[offset++] = from.y;
      this.debugPositions[offset++] = from.z;
      this.debugPositions[offset++] = to.x;
      this.debugPositions[offset++] = to.y;
      this.debugPositions[offset++] = to.z;
    }
    this.debugAttribute.needsUpdate = true;
    this.debugLines.visible = true;
  }

  private pairVisible(joints: BodyJoints, startName: keyof BodyJoints, endName: keyof BodyJoints): boolean {
    if (startName === "leftWrist" || endName === "leftWrist") return joints.leftWristVisible && joints.leftElbowVisible;
    if (startName === "rightWrist" || endName === "rightWrist") return joints.rightWristVisible && joints.rightElbowVisible;
    if (startName === "leftElbow" || endName === "leftElbow") return joints.leftElbowVisible;
    if (startName === "rightElbow" || endName === "rightElbow") return joints.rightElbowVisible;
    return true;
  }
}

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}
