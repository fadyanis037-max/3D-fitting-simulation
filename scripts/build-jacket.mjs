import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";

const SHOULDER = 0.42;
const TORSO = 0.56;
const UPPER = 0.3;
const FORE = 0.26;

const WOOL = [0.32, 0.4, 0.54];
const WOOL_DARK = [0.2, 0.26, 0.36];
const COLLAR = [0.14, 0.17, 0.24];
const CUFF = [0.16, 0.2, 0.28];
const BUTTON = [0.82, 0.8, 0.74];
const LINING = [0.45, 0.32, 0.24];

const UP = new Vector3(0, 1, 0);

function aim(x, y, z) {
  const direction = new Vector3(x, y, z).normalize();
  const quaternion = new Quaternion();
  if (direction.dot(UP) < -0.999) quaternion.set(1, 0, 0, 0);
  else quaternion.setFromUnitVectors(UP, direction);
  return quaternion;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class Builder {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.joints = [];
    this.weights = [];
    this.indices = [];
  }

  add(point, color, joint, other = 0, weight = 1) {
    const index = this.positions.length / 3;
    this.positions.push(point.x, point.y, point.z);
    this.colors.push(color[0], color[1], color[2]);
    this.joints.push(joint, other, 0, 0);
    this.weights.push(weight, 1 - weight, 0, 0);
    return index;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  normals() {
    const normals = new Float32Array(this.positions.length);
    for (let i = 0; i < this.indices.length; i += 3) {
      const ia = this.indices[i] * 3;
      const ib = this.indices[i + 1] * 3;
      const ic = this.indices[i + 2] * 3;
      const abx = this.positions[ib] - this.positions[ia];
      const aby = this.positions[ib + 1] - this.positions[ia + 1];
      const abz = this.positions[ib + 2] - this.positions[ia + 2];
      const acx = this.positions[ic] - this.positions[ia];
      const acy = this.positions[ic + 1] - this.positions[ia + 1];
      const acz = this.positions[ic + 2] - this.positions[ia + 2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      normals[ia] += nx;
      normals[ia + 1] += ny;
      normals[ia + 2] += nz;
      normals[ib] += nx;
      normals[ib + 1] += ny;
      normals[ib + 2] += nz;
      normals[ic] += nx;
      normals[ic + 1] += ny;
      normals[ic + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    }
    return normals;
  }
}

function ringPoint(theta, rx, rz, y, target) {
  target.set(Math.sin(theta) * rx, y, Math.cos(theta) * rz);
}

function addOpenShell(builder, options) {
  const { rings, segments, gap, radiusX, radiusZ, heightAt, colorAt, joint } = options;
  const start = gap / 2;
  const sweep = Math.PI * 2 - gap;
  const ids = [];
  const point = new Vector3();
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const row = [];
    for (let step = 0; step <= segments; step += 1) {
      const u = step / segments;
      const theta = start + sweep * u;
      ringPoint(theta, radiusX(t), radiusZ(t), heightAt(t), point);
      const edge = step === 0 || step === segments;
      const color = edge ? LINING : colorAt(t, u);
      row.push(builder.add(point, color, joint));
    }
    ids.push(row);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let step = 0; step < segments; step += 1) {
      const a = ids[ring][step];
      const b = ids[ring][step + 1];
      const c = ids[ring + 1][step];
      const d = ids[ring + 1][step + 1];
      builder.tri(a, b, d);
      builder.tri(a, d, c);
    }
  }
}

function addSleeve(builder, bone, length, radiusTop, radiusBottom, joint, parentJoint, childJoint) {
  const rings = 7;
  const segments = 14;
  const ids = [];
  const local = new Vector3();
  const world = new Vector3();
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const y = -0.08 + t * (length + 0.08);
    const radius = lerp(radiusTop, radiusBottom, t);
    let weight = 1;
    let other = joint;
    if (t < 0.1) {
      weight = 0.82;
      other = parentJoint;
    } else if (childJoint !== undefined && t > 0.88) {
      weight = 0.72;
      other = childJoint;
    }
    const row = [];
    for (let step = 0; step < segments; step += 1) {
      const theta = (step / segments) * Math.PI * 2;
      local.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      world.copy(local).applyMatrix4(bone.matrixWorld);
      const shade = 0.86 + 0.14 * Math.max(0, Math.cos(theta));
      const base = t > 0.86 ? CUFF : WOOL;
      row.push(builder.add(world, [base[0] * shade, base[1] * shade, base[2] * shade], joint, other, weight));
    }
    ids.push(row);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let step = 0; step < segments; step += 1) {
      const next = (step + 1) % segments;
      const a = ids[ring][step];
      const b = ids[ring][next];
      const c = ids[ring + 1][step];
      const d = ids[ring + 1][next];
      builder.tri(a, b, d);
      builder.tri(a, d, c);
    }
  }

  const cap = [];
  const center = local.set(0, length, 0).applyMatrix4(bone.matrixWorld);
  const hub = builder.add(center, CUFF, joint);
  for (let step = 0; step < segments; step += 1) {
    const theta = (step / segments) * Math.PI * 2;
    local.set(Math.cos(theta) * radiusBottom, length, Math.sin(theta) * radiusBottom);
    cap.push(builder.add(local.applyMatrix4(bone.matrixWorld), CUFF, joint));
  }
  for (let step = 0; step < segments; step += 1) {
    builder.tri(hub, cap[step], cap[(step + 1) % segments]);
  }
}

function addSphere(builder, cx, cy, cz, radius, color, joint) {
  const lats = 8;
  const lons = 12;
  const ids = [];
  const point = new Vector3();
  for (let lat = 0; lat <= lats; lat += 1) {
    const v = (lat / lats) * Math.PI;
    const row = [];
    for (let lon = 0; lon < lons; lon += 1) {
      const u = (lon / lons) * Math.PI * 2;
      point.set(
        cx + Math.sin(v) * Math.cos(u) * radius,
        cy + Math.cos(v) * radius,
        cz + Math.sin(v) * Math.sin(u) * radius,
      );
      row.push(builder.add(point, color, joint));
    }
    ids.push(row);
  }
  for (let lat = 0; lat < lats; lat += 1) {
    for (let lon = 0; lon < lons; lon += 1) {
      const next = (lon + 1) % lons;
      const a = ids[lat][lon];
      const b = ids[lat][next];
      const c = ids[lat + 1][lon];
      const d = ids[lat + 1][next];
      builder.tri(a, c, d);
      builder.tri(a, d, b);
    }
  }
}

function addButtons(builder) {
  const center = new Vector3();
  const offset = new Vector3();
  for (let i = 0; i < 4; i += 1) {
    center.set(-0.03, 0.18 + i * 0.08, 0.125);
    const hub = builder.add(center, BUTTON, 0);
    const ring = [];
    for (let step = 0; step < 8; step += 1) {
      const theta = (step / 8) * Math.PI * 2;
      offset.set(center.x + Math.cos(theta) * 0.012, center.y + Math.sin(theta) * 0.012, center.z + 0.004);
      ring.push(builder.add(offset, BUTTON, 0));
    }
    for (let step = 0; step < 8; step += 1) builder.tri(hub, ring[step], ring[(step + 1) % 8]);
  }
}

function buildBones() {
  const garment = new Object3D();
  garment.name = "garment";
  const torso = new Object3D();
  torso.name = "torso";
  garment.add(torso);

  const leftUpper = new Object3D();
  leftUpper.name = "leftUpperArm";
  leftUpper.position.set(SHOULDER / 2, TORSO, 0);
  leftUpper.quaternion.copy(aim(0.38, -0.9, 0.16));
  torso.add(leftUpper);

  const leftFore = new Object3D();
  leftFore.name = "leftForearm";
  leftFore.position.set(0, UPPER, 0);
  leftFore.quaternion.copy(aim(0.06, 0.94, 0.22));
  leftUpper.add(leftFore);

  const rightUpper = new Object3D();
  rightUpper.name = "rightUpperArm";
  rightUpper.position.set(-SHOULDER / 2, TORSO, 0);
  rightUpper.quaternion.copy(aim(-0.38, -0.9, 0.16));
  torso.add(rightUpper);

  const rightFore = new Object3D();
  rightFore.name = "rightForearm";
  rightFore.position.set(0, UPPER, 0);
  rightFore.quaternion.copy(aim(-0.06, 0.94, 0.22));
  rightUpper.add(rightFore);

  garment.updateMatrixWorld(true);
  return { garment, torso, leftUpper, leftFore, rightUpper, rightFore };
}

function buildMesh(bones) {
  const builder = new Builder();
  addOpenShell(builder, {
    rings: 16,
    segments: 28,
    gap: 0.42,
    joint: 0,
    radiusX: (t) => lerp(0.16, 0.26, Math.pow(t, 0.65)) * (1 - 0.06 * Math.sin(t * Math.PI)),
    radiusZ: (t) => lerp(0.11, 0.14, t),
    heightAt: (t) => lerp(0.015, TORSO, t),
    colorAt: (t) => (t > 0.92 ? COLLAR : t < 0.08 ? WOOL_DARK : WOOL),
  });
  addSleeve(builder, bones.leftUpper, UPPER, 0.078, 0.055, 1, 0, 2);
  addSleeve(builder, bones.leftFore, FORE, 0.052, 0.042, 2, 1);
  addSleeve(builder, bones.rightUpper, UPPER, 0.078, 0.055, 3, 0, 4);
  addSleeve(builder, bones.rightFore, FORE, 0.052, 0.042, 4, 3);
  addSphere(builder, SHOULDER / 2, TORSO, 0, 0.09, WOOL, 0);
  addSphere(builder, -SHOULDER / 2, TORSO, 0, 0.09, WOOL, 0);
  addButtons(builder);
  return builder;
}

function quatArray(quaternion) {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function vecArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function packGlb(bones, builder) {
  const normals = builder.normals();
  const position = Float32Array.from(builder.positions);
  const color = Float32Array.from(builder.colors);
  const joints = Uint8Array.from(builder.joints);
  const weights = Float32Array.from(builder.weights);
  const indices = Uint16Array.from(builder.indices);
  const inverse = new Float32Array(5 * 16);
  const ordered = [bones.torso, bones.leftUpper, bones.leftFore, bones.rightUpper, bones.rightFore];
  const inverseMatrix = new Matrix4();
  ordered.forEach((bone, index) => {
    inverseMatrix.copy(bone.matrixWorld).invert();
    inverse.set(inverseMatrix.elements, index * 16);
  });

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    minX = Math.min(minX, position[i]);
    minY = Math.min(minY, position[i + 1]);
    minZ = Math.min(minZ, position[i + 2]);
    maxX = Math.max(maxX, position[i]);
    maxY = Math.max(maxY, position[i + 1]);
    maxZ = Math.max(maxZ, position[i + 2]);
  }

  const parts = [
    Buffer.from(position.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(color.buffer),
    Buffer.from(joints.buffer),
    Buffer.from(weights.buffer),
    Buffer.from(indices.buffer),
    Buffer.from(inverse.buffer),
  ];
  const chunks = [];
  for (const part of parts) {
    chunks.push(part);
    const pad = (4 - (part.length % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  const bin = Buffer.concat(chunks);

  const views = [];
  const accessors = [];
  let cursor = 0;
  function view(part, target) {
    const byteOffset = cursor;
    const pad = (4 - (part.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset, byteLength: part.length, ...(target ? { target } : {}) });
    cursor += part.length + pad;
    return views.length - 1;
  }

  const positionView = view(parts[0], 34962);
  accessors.push({
    bufferView: positionView,
    componentType: 5126,
    count: position.length / 3,
    type: "VEC3",
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  });
  accessors.push({ bufferView: view(parts[1], 34962), componentType: 5126, count: normals.length / 3, type: "VEC3" });
  accessors.push({ bufferView: view(parts[2], 34962), componentType: 5126, count: color.length / 3, type: "VEC3" });
  accessors.push({ bufferView: view(parts[3], 34962), componentType: 5121, count: joints.length / 4, type: "VEC4" });
  accessors.push({ bufferView: view(parts[4], 34962), componentType: 5126, count: weights.length / 4, type: "VEC4" });
  accessors.push({ bufferView: view(parts[5], 34963), componentType: 5123, count: indices.length, type: "SCALAR" });
  accessors.push({ bufferView: view(parts[6]), componentType: 5126, count: 5, type: "MAT4" });

  const node = (bone, children) => ({
    name: bone.name,
    translation: vecArray(bone.position),
    rotation: quatArray(bone.quaternion),
    ...(children ? { children } : {}),
  });

  const json = {
    asset: { version: "2.0", generator: "vto-jacket" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: "garment",
        children: [1, 6],
        extras: {
          shoulderWidth: SHOULDER,
          torsoLength: TORSO,
          upperArmLength: UPPER,
          forearmLength: FORE,
        },
      },
      node(bones.torso, [2, 4]),
      node(bones.leftUpper, [3]),
      node(bones.leftFore),
      node(bones.rightUpper, [5]),
      node(bones.rightFore),
      { name: "jacket", mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1, 2, 3, 4, 5], inverseBindMatrices: 6 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
            indices: 5,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.04,
          roughnessFactor: 0.78,
        },
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(json));
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  const total = 12 + 8 + jsonBuffer.length + jsonPad + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let write = 12;
  out.writeUInt32LE(jsonBuffer.length + jsonPad, write);
  write += 4;
  out.writeUInt32LE(0x4e4f534a, write);
  write += 4;
  jsonBuffer.copy(out, write);
  write += jsonBuffer.length;
  out.fill(0x20, write, write + jsonPad);
  write += jsonPad;
  out.writeUInt32LE(bin.length, write);
  write += 4;
  out.writeUInt32LE(0x004e4942, write);
  write += 4;
  bin.copy(out, write);
  return out;
}

const bones = buildBones();
const builder = buildMesh(bones);
const glb = packGlb(bones, builder);
const output = join(dirname(fileURLToPath(import.meta.url)), "../apps/demo/public/garments/jacket.glb");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, glb);
console.log(`Wrote ${output} (${glb.length} bytes, ${builder.indices.length / 3} triangles)`);
