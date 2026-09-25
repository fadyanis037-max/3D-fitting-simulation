import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { BodyJoints } from "../rig/joints";

interface Point {
  x: number;
  y: number;
}

/**
 * One flat jacket, painted in screen space and pinned to the shoulders, hips, and arms.
 * Round joins keep the sleeves attached at the shoulder and elbow.
 */
export class PhotoGarment {
  readonly root = new Group();
  private readonly paint = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly mesh: Mesh;
  private aspect = 16 / 9;

  constructor() {
    this.paint.width = 1280;
    this.paint.height = 720;
    const context = this.paint.getContext("2d");
    if (!context) throw new Error("Could not draw the jacket.");
    this.ctx = context;

    this.texture = new CanvasTexture(this.paint);
    this.texture.colorSpace = SRGBColorSpace;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    this.mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.visible = false;
    this.resize(this.aspect);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    const attribute = this.mesh.geometry.getAttribute("position") as BufferAttribute;
    const positions = attribute.array as Float32Array;
    const corners = [
      [-aspect, 1],
      [aspect, 1],
      [-aspect, -1],
      [aspect, -1],
    ];
    for (let i = 0; i < corners.length; i += 1) {
      const corner = corners[i];
      if (!corner) continue;
      positions[i * 3] = corner[0];
      positions[i * 3 + 1] = corner[1];
      positions[i * 3 + 2] = 0;
    }
    attribute.needsUpdate = true;
  }

  apply(joints: BodyJoints): void {
    const ctx = this.ctx;
    const width = this.paint.width;
    const height = this.paint.height;
    ctx.clearRect(0, 0, width, height);

    const project = (point: Vector3): Point => ({
      x: (point.x / this.aspect + 1) * 0.5 * width,
      y: (1 - point.y) * 0.5 * height,
    });

    const leftShoulder = project(joints.leftShoulder);
    const rightShoulder = project(joints.rightShoulder);
    const leftHip = project(joints.leftHip);
    const rightHip = project(joints.rightHip);
    const shoulderSpan = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
    const arm = Math.max(18, shoulderSpan * 0.34);

    this.drawArm(project(joints.leftShoulder), project(joints.leftElbow), project(joints.leftWrist), arm, joints.leftElbowVisible, joints.leftWristVisible);
    this.drawArm(project(joints.rightShoulder), project(joints.rightElbow), project(joints.rightWrist), arm, joints.rightElbowVisible, joints.rightWristVisible);
    this.drawTorso(leftShoulder, rightShoulder, leftHip, rightHip, shoulderSpan);

    this.texture.needsUpdate = true;
  }

  private drawArm(
    shoulder: Point,
    elbow: Point,
    wrist: Point,
    thickness: number,
    elbowVisible: boolean,
    wristVisible: boolean,
  ): void {
    if (!elbowVisible) return;
    const ctx = this.ctx;
    const armLen = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y) || 1;
    const inset = Math.min(thickness * 0.55, armLen * 0.25);
    const start = {
      x: shoulder.x + ((elbow.x - shoulder.x) / armLen) * inset,
      y: shoulder.y + ((elbow.y - shoulder.y) / armLen) * inset,
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a2636";
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(elbow.x, elbow.y);
    if (wristVisible) ctx.lineTo(wrist.x, wrist.y);
    ctx.stroke();

    ctx.strokeStyle = "#3d5270";
    ctx.lineWidth = thickness * 0.62;
    ctx.stroke();

    if (!wristVisible) return;
    ctx.strokeStyle = "#1a2638";
    ctx.lineWidth = thickness * 0.72;
    const along = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) || 1;
    const cuff = Math.min(thickness * 1.15, along * 0.38);
    ctx.beginPath();
    ctx.moveTo(wrist.x - ((wrist.x - elbow.x) / along) * cuff, wrist.y - ((wrist.y - elbow.y) / along) * cuff);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.stroke();
  }

  private drawTorso(leftShoulder: Point, rightShoulder: Point, leftHip: Point, rightHip: Point, shoulderSpan: number): void {
    const ctx = this.ctx;
    const acrossX = leftShoulder.x - rightShoulder.x;
    const acrossY = leftShoulder.y - rightShoulder.y;
    const across = Math.hypot(acrossX, acrossY) || 1;
    const ax = acrossX / across;
    const ay = acrossY / across;
    const midX = (leftShoulder.x + rightShoulder.x) / 2;
    const midY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipX = (leftHip.x + rightHip.x) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const downX = hipX - midX;
    const downY = hipY - midY;
    const down = Math.hypot(downX, downY) || 1;
    const dx = downX / down;
    const dy = downY / down;
    const out = shoulderSpan * 0.08;
    const hipOut = shoulderSpan * 0.22;
    const collar = shoulderSpan * 0.16;
    const hem = shoulderSpan * 0.28;

    const ls = { x: leftShoulder.x + ax * out - dx * collar * 0.15, y: leftShoulder.y + ay * out - dy * collar * 0.15 };
    const rs = { x: rightShoulder.x - ax * out - dx * collar * 0.15, y: rightShoulder.y - ay * out - dy * collar * 0.15 };
    const lh = { x: leftHip.x + ax * hipOut + dx * hem, y: leftHip.y + ay * hipOut + dy * hem };
    const rh = { x: rightHip.x - ax * hipOut + dx * hem, y: rightHip.y - ay * hipOut + dy * hem };
    const neck = { x: midX + dx * collar, y: midY + dy * collar };

    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.quadraticCurveTo(neck.x, neck.y, rs.x, rs.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.quadraticCurveTo(hipX + dx * (hem + shoulderSpan * 0.06), hipY + dy * (hem + shoulderSpan * 0.06), lh.x, lh.y);
    ctx.closePath();
    ctx.fillStyle = "#2c3f58";
    ctx.fill();

    ctx.save();
    ctx.clip();
    const shade = ctx.createLinearGradient(rs.x, rs.y, ls.x, ls.y);
    shade.addColorStop(0, "rgba(0,0,0,0.28)");
    shade.addColorStop(0.2, "rgba(255,255,255,0.04)");
    shade.addColorStop(0.8, "rgba(255,255,255,0.04)");
    shade.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, this.paint.width, this.paint.height);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(2, shoulderSpan * 0.012);
    ctx.beginPath();
    ctx.moveTo(neck.x, neck.y);
    ctx.lineTo(hipX + dx * hem * 0.92, hipY + dy * hem * 0.92);
    ctx.stroke();

    const pocket = shoulderSpan * 0.16;
    this.drawPocket((ls.x + neck.x) / 2, (ls.y + hipY) / 2, pocket);
    this.drawPocket((rs.x + neck.x) / 2, (rs.y + hipY) / 2, pocket);

    ctx.strokeStyle = "#152033";
    ctx.lineWidth = Math.max(6, shoulderSpan * 0.045);
    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.quadraticCurveTo(neck.x, neck.y, rs.x, rs.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPocket(x: number, y: number, size: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#24364e";
    ctx.fillRect(x - size / 2, y, size, size * 0.62);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - size / 2, y, size, size * 0.62);
  }
}
