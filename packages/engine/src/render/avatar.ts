import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  SphereGeometry,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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

interface GarmentFit {
  shoulderWidth: number;
  torsoLength: number;
  upperArmLength: number;
  forearmLength: number;
}

function limb(radiusTop: number, radiusBottom: number, length: number, material: MeshBasicMaterial): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radiusTop, radiusBottom, length, 18), material);
  mesh.position.y = length / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

/** Loads the jacket file and keeps an invisible body so arms can cover the cloth. */
export class Avatar {
  readonly root = new Group();
  readonly debugRoot = new Group();
  rig: AvatarRig | null = null;
  private readonly debugPositions: Float32Array;
  private readonly debugAttribute: BufferAttribute;
  private readonly debugLines: LineSegments;
  private showSkeleton = false;

  constructor() {
    this.root.visible = false;
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
    this.debugRoot.add(this.debugLines);
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const garment = gltf.scene.getObjectByName("garment") ?? gltf.scene;
    const fit = readFit(garment);
    const torso = findBone(gltf.scene, "torso");
    const leftUpperArm = findBone(gltf.scene, "leftUpperArm");
    const leftForearm = findBone(gltf.scene, "leftForearm");
    const rightUpperArm = findBone(gltf.scene, "rightUpperArm");
    const rightForearm = findBone(gltf.scene, "rightForearm");

    gltf.scene.traverse((object) => {
      const skinned = object as SkinnedMesh;
      if (!skinned.isSkinnedMesh) return;
      skinned.frustumCulled = false;
      skinned.renderOrder = 1;
      const materials = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.side = DoubleSide;
        material.roughness = 0.78;
        material.metalness = 0.04;
      }
    });

    const occluder = new MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    torso.add(limb(0.11, 0.09, fit.torsoLength * 0.92, occluder));
    leftUpperArm.add(limb(0.045, 0.04, fit.upperArmLength * 0.9, occluder));
    rightUpperArm.add(limb(0.045, 0.04, fit.upperArmLength * 0.9, occluder));
    leftForearm.add(limb(0.038, 0.032, fit.forearmLength * 0.92, occluder));
    rightForearm.add(limb(0.038, 0.032, fit.forearmLength * 0.92, occluder));

    const head = new Group();
    const skull = new Mesh(new SphereGeometry(fit.shoulderWidth * 0.2, 20, 16), occluder);
    skull.frustumCulled = false;
    skull.renderOrder = 0;
    head.add(skull);

    this.root.add(gltf.scene, head);
    this.rig = {
      root: this.root,
      modelShoulderWidth: fit.shoulderWidth,
      torso,
      leftUpperArm,
      rightUpperArm,
      leftForearm,
      rightForearm,
      head,
    };
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
    this.debugRoot.visible = visible;
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

function findBone(root: Object3D, name: string): Object3D {
  const bone = root.getObjectByName(name);
  if (!bone) throw new Error(`The jacket is missing the "${name}" bone.`);
  return bone;
}

function readFit(root: Object3D): GarmentFit {
  const extras = root.userData as Partial<GarmentFit>;
  if (
    typeof extras.shoulderWidth !== "number" ||
    typeof extras.torsoLength !== "number" ||
    typeof extras.upperArmLength !== "number" ||
    typeof extras.forearmLength !== "number"
  ) {
    throw new Error("The jacket file is missing its fit measurements.");
  }
  return extras as GarmentFit;
}

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}
