import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Landmark } from "../types";
import { landmarkToView } from "../rig/joints";

/** Pose landmarks 0–10 are the face. The skeleton starts at the shoulders. */
const BODY_START = 11;
const MIN_VISIBILITY = 0.5;

/** MediaPipe body connections, with every face link left out. */
const BODY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

const MAX_POINTS = 22;

/**
 * White joint dots and connecting lines over the camera image.
 * Face landmarks are never drawn.
 */
export class PoseSkeleton {
  readonly root = new Group();
  private readonly linePositions = new Float32Array(BODY_CONNECTIONS.length * 6);
  private readonly pointPositions = new Float32Array(MAX_POINTS * 3);
  private readonly pointAttribute: BufferAttribute;
  private readonly lines: LineSegments2;
  private readonly lineMaterial: LineMaterial;
  private shown = true;
  private readonly scratch = new Vector3();

  constructor() {
    const lineGeometry = new LineSegmentsGeometry();
    this.lineMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 4,
      depthTest: false,
      transparent: true,
    });
    this.lines = new LineSegments2(lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;

    const pointGeometry = new BufferGeometry();
    this.pointAttribute = new BufferAttribute(this.pointPositions, 3);
    pointGeometry.setAttribute("position", this.pointAttribute);
    const dots = new Points(
      pointGeometry,
      new PointsMaterial({
        color: 0xffffff,
        size: 10,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      }),
    );
    dots.frustumCulled = false;
    dots.renderOrder = 4;
    this.root.add(this.lines, dots);
    this.root.visible = false;
  }

  setShown(shown: boolean): void {
    this.shown = shown;
    if (!shown) this.root.visible = false;
  }

  hide(): void {
    this.root.visible = false;
  }

  setResolution(width: number, height: number): void {
    this.lineMaterial.resolution.set(width, height);
  }

  /** Returns whether any body joint was visible enough to draw. */
  update(landmarks: Landmark[], aspect: number): boolean {
    if (!this.shown) {
      this.root.visible = false;
      return false;
    }

    const visible = (index: number): boolean => (landmarks[index]?.visibility ?? 0) >= MIN_VISIBILITY;
    let pointCount = 0;
    const pointLimit = Math.min(landmarks.length, BODY_START + MAX_POINTS);
    for (let index = BODY_START; index < pointLimit; index += 1) {
      if (!visible(index)) continue;
      landmarkToView(landmarks[index], aspect, this.scratch);
      const offset = pointCount * 3;
      this.pointPositions[offset] = this.scratch.x;
      this.pointPositions[offset + 1] = this.scratch.y;
      this.pointPositions[offset + 2] = this.scratch.z;
      pointCount += 1;
    }

    let lineOffset = 0;
    for (const [start, end] of BODY_CONNECTIONS) {
      if (!visible(start) || !visible(end)) continue;
      landmarkToView(landmarks[start], aspect, this.scratch);
      this.linePositions[lineOffset++] = this.scratch.x;
      this.linePositions[lineOffset++] = this.scratch.y;
      this.linePositions[lineOffset++] = this.scratch.z;
      landmarkToView(landmarks[end], aspect, this.scratch);
      this.linePositions[lineOffset++] = this.scratch.x;
      this.linePositions[lineOffset++] = this.scratch.y;
      this.linePositions[lineOffset++] = this.scratch.z;
    }

    const dots = this.root.children[1] as Points;
    dots.geometry.setDrawRange(0, pointCount);
    this.pointAttribute.needsUpdate = true;
    if (lineOffset >= 6) {
      this.lines.geometry.setPositions(this.linePositions.subarray(0, lineOffset));
      this.lines.visible = true;
    } else {
      this.lines.visible = false;
    }
    this.root.visible = pointCount > 0;
    return pointCount > 0;
  }
}
