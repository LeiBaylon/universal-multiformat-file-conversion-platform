export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MeshData {
  vertices: Vec3[];
  faces: [number, number, number][];
}

export interface MeshStats {
  vertexCount: number;
  faceCount: number;
  boundsMin: Vec3;
  boundsMax: Vec3;
  center: Vec3;
}

function triangulatePolygon(indices: number[]): [number, number, number][] {
  const tris: [number, number, number][] = [];
  for (let i = 1; i + 1 < indices.length; i++) {
    tris.push([indices[0], indices[i], indices[i + 1]]);
  }
  return tris;
}

export function computeMeshStats(mesh: MeshData): MeshStats {
  if (mesh.vertices.length === 0) {
    const zero = { x: 0, y: 0, z: 0 };
    return { vertexCount: 0, faceCount: 0, boundsMin: zero, boundsMax: zero, center: zero };
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of mesh.vertices) {
    if (v.x < min.x) min.x = v.x;
    if (v.y < min.y) min.y = v.y;
    if (v.z < min.z) min.z = v.z;
    if (v.x > max.x) max.x = v.x;
    if (v.y > max.y) max.y = v.y;
    if (v.z > max.z) max.z = v.z;
  }
  return {
    vertexCount: mesh.vertices.length,
    faceCount: mesh.faces.length,
    boundsMin: min,
    boundsMax: max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
  };
}

function computeFaceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

export function parseMesh(buffer: Buffer, ext: string): MeshData {
  const format = ext.toLowerCase();

  if (format === 'obj') {
    const text = buffer.toString('utf8');
    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\s+/);
      if (parts[0] === 'v' && parts.length >= 4) {
        vertices.push({ x: Number(parts[1]) || 0, y: Number(parts[2]) || 0, z: Number(parts[3]) || 0 });
      } else if (parts[0] === 'f' && parts.length >= 4) {
        const idx = parts.slice(1).map((tok) => {
          const rawIdx = parseInt(tok.split('/')[0], 10);
          return rawIdx < 0 ? vertices.length + rawIdx : rawIdx - 1;
        });
        faces.push(...triangulatePolygon(idx));
      }
    }
    return { vertices, faces };
  }

  if (format === 'stl') {
    const asciiCheck = buffer.subarray(0, 80).toString('ascii').trim();
    const looksAscii = asciiCheck.startsWith('solid') && buffer.toString('utf8').includes('facet normal');
    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    const vMap = new Map<string, number>();
    const addVertex = (v: Vec3) => {
      const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
      const existing = vMap.get(key);
      if (existing !== undefined) return existing;
      const idx = vertices.length;
      vertices.push(v);
      vMap.set(key, idx);
      return idx;
    };

    if (looksAscii) {
      const text = buffer.toString('utf8');
      const vertexRegex = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
      const triVerts: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = vertexRegex.exec(text)) !== null) {
        triVerts.push(addVertex({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) }));
        if (triVerts.length === 3) {
          faces.push([triVerts[0], triVerts[1], triVerts[2]]);
          triVerts.length = 0;
        }
      }
      return { vertices, faces };
    } else if (buffer.length >= 84) {
      const triCount = buffer.readUInt32LE(80);
      let offset = 84;
      for (let i = 0; i < triCount && offset + 50 <= buffer.length; i++) {
        offset += 12; // skip normal
        const a = addVertex({
          x: buffer.readFloatLE(offset),
          y: buffer.readFloatLE(offset + 4),
          z: buffer.readFloatLE(offset + 8),
        });
        const b = addVertex({
          x: buffer.readFloatLE(offset + 12),
          y: buffer.readFloatLE(offset + 16),
          z: buffer.readFloatLE(offset + 20),
        });
        const c = addVertex({
          x: buffer.readFloatLE(offset + 24),
          y: buffer.readFloatLE(offset + 28),
          z: buffer.readFloatLE(offset + 32),
        });
        faces.push([a, b, c]);
        offset += 38;
      }
      return { vertices, faces };
    }
  }

  if (format === 'off') {
    const lines = buffer
      .toString('utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);
    let cursor = 0;
    if (lines[0]?.toUpperCase() === 'OFF') cursor++;
    const counts = (lines[cursor++] || '').split(/\s+/).map(Number);
    const vCount = counts[0] || 0;
    const fCount = counts[1] || 0;
    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    for (let i = 0; i < vCount && cursor < lines.length; i++, cursor++) {
      const p = lines[cursor].split(/\s+/).map(Number);
      vertices.push({ x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 });
    }
    for (let i = 0; i < fCount && cursor < lines.length; i++, cursor++) {
      const p = lines[cursor].split(/\s+/).map(Number);
      const n = p[0] || 0;
      const idx = p.slice(1, 1 + n);
      if (idx.length >= 3) faces.push(...triangulatePolygon(idx));
    }
    return { vertices, faces };
  }

  if (format === 'ply') {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/);
    let vCount = 0;
    let fCount = 0;
    let headerEnd = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith('element vertex')) vCount = Number(l.split(/\s+/)[2]) || 0;
      if (l.startsWith('element face')) fCount = Number(l.split(/\s+/)[2]) || 0;
      if (l === 'end_header') {
        headerEnd = i + 1;
        break;
      }
    }
    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    let cursor = headerEnd;
    for (let i = 0; i < vCount && cursor < lines.length; i++, cursor++) {
      const p = lines[cursor].trim().split(/\s+/).map(Number);
      if (p.length >= 3) vertices.push({ x: p[0], y: p[1], z: p[2] });
    }
    for (let i = 0; i < fCount && cursor < lines.length; i++, cursor++) {
      const p = lines[cursor].trim().split(/\s+/).map(Number);
      const n = p[0] || 0;
      if (n >= 3) faces.push(...triangulatePolygon(p.slice(1, 1 + n)));
    }
    return { vertices, faces };
  }

  if (format === 'gltf' || format === 'glb') {
    let gltfJson: {
      meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number }; indices?: number }> }>;
      accessors?: Array<{ bufferView?: number; count?: number; componentType?: number; type?: string; byteOffset?: number }>;
      bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength?: number }>;
      buffers?: Array<{ uri?: string; byteLength?: number }>;
    };
    let binBuffer: Buffer | null = null;

    if (format === 'glb') {
      const jsonLen = buffer.readUInt32LE(12);
      const jsonStr = buffer.subarray(20, 20 + jsonLen).toString('utf8');
      gltfJson = JSON.parse(jsonStr);
      const binStart = 20 + jsonLen;
      if (binStart + 8 <= buffer.length) {
        const binLen = buffer.readUInt32LE(binStart);
        binBuffer = buffer.subarray(binStart + 8, binStart + 8 + binLen);
      }
    } else {
      gltfJson = JSON.parse(buffer.toString('utf8'));
      const uri = gltfJson.buffers?.[0]?.uri;
      if (uri && uri.startsWith('data:')) {
        const b64 = uri.split(',')[1] || '';
        binBuffer = Buffer.from(b64, 'base64');
      }
    }

    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    const prim = gltfJson.meshes?.[0]?.primitives?.[0];
    if (prim && binBuffer && prim.attributes?.POSITION !== undefined) {
      const posAcc = gltfJson.accessors?.[prim.attributes.POSITION];
      const posBv = posAcc?.bufferView !== undefined ? gltfJson.bufferViews?.[posAcc.bufferView] : undefined;
      if (posAcc && posBv) {
        const base = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
        const count = posAcc.count || 0;
        for (let i = 0; i < count; i++) {
          const o = base + i * 12;
          if (o + 12 <= binBuffer.length) {
            vertices.push({
              x: binBuffer.readFloatLE(o),
              y: binBuffer.readFloatLE(o + 4),
              z: binBuffer.readFloatLE(o + 8),
            });
          }
        }
      }
      if (prim.indices !== undefined) {
        const idxAcc = gltfJson.accessors?.[prim.indices];
        const idxBv = idxAcc?.bufferView !== undefined ? gltfJson.bufferViews?.[idxAcc.bufferView] : undefined;
        if (idxAcc && idxBv) {
          const base = (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
          const count = idxAcc.count || 0;
          const isU32 = idxAcc.componentType === 5125;
          const stride = isU32 ? 4 : 2;
          const flat: number[] = [];
          for (let i = 0; i < count; i++) {
            const o = base + i * stride;
            if (o + stride <= binBuffer.length) {
              flat.push(isU32 ? binBuffer.readUInt32LE(o) : binBuffer.readUInt16LE(o));
            }
          }
          for (let i = 0; i + 2 < flat.length; i += 3) {
            faces.push([flat[i], flat[i + 1], flat[i + 2]]);
          }
        }
      }
    }
    return { vertices, faces };
  }

  if (format === 'x3d') {
    const text = buffer.toString('utf8');
    const pointMatch = text.match(/point=["']([^"']+)["']/i);
    const coordMatch = text.match(/coordIndex=["']([^"']+)["']/i);
    const nums = (pointMatch?.[1] || '').trim().split(/[\s,]+/).map(Number);
    const vertices: Vec3[] = [];
    for (let i = 0; i + 2 < nums.length; i += 3) {
      vertices.push({ x: nums[i], y: nums[i + 1], z: nums[i + 2] });
    }
    const idxRaw = (coordMatch?.[1] || '').trim().split(/[\s,]+/).map(Number);
    const faces: [number, number, number][] = [];
    let poly: number[] = [];
    for (const n of idxRaw) {
      if (n === -1) {
        if (poly.length >= 3) faces.push(...triangulatePolygon(poly));
        poly = [];
      } else if (!Number.isNaN(n)) {
        poly.push(n);
      }
    }
    if (poly.length >= 3) faces.push(...triangulatePolygon(poly));
    return { vertices, faces };
  }

  if (format === 'wrl') {
    const text = buffer.toString('utf8');
    const pointMatch = text.match(/point\s*\[([\s\S]*?)\]/i);
    const coordMatch = text.match(/coordIndex\s*\[([\s\S]*?)\]/i);
    const nums = (pointMatch?.[1] || '').trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    const vertices: Vec3[] = [];
    for (let i = 0; i + 2 < nums.length; i += 3) {
      vertices.push({ x: nums[i], y: nums[i + 1], z: nums[i + 2] });
    }
    const idxRaw = (coordMatch?.[1] || '').trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    const faces: [number, number, number][] = [];
    let poly: number[] = [];
    for (const n of idxRaw) {
      if (n === -1) {
        if (poly.length >= 3) faces.push(...triangulatePolygon(poly));
        poly = [];
      } else {
        poly.push(n);
      }
    }
    if (poly.length >= 3) faces.push(...triangulatePolygon(poly));
    return { vertices, faces };
  }

  throw new Error(`Unsupported 3D mesh input format: ${ext}`);
}

export function scaleMesh(mesh: MeshData, scale = 1): MeshData {
  if (!scale || scale === 1) return mesh;
  return {
    vertices: mesh.vertices.map((v) => ({ x: v.x * scale, y: v.y * scale, z: v.z * scale })),
    faces: mesh.faces,
  };
}

export function serializeMesh(mesh: MeshData, targetExt: string): Buffer {
  const format = targetExt.toLowerCase();
  const stats = computeMeshStats(mesh);

  if (format === 'obj') {
    const lines = ['# Exported by Aether Convert Mesh Engine'];
    for (const v of mesh.vertices) {
      lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
    }
    for (const [a, b, c] of mesh.faces) {
      lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
    }
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
  }

  if (format === 'off') {
    const lines = ['OFF', `${mesh.vertices.length} ${mesh.faces.length} 0`];
    for (const v of mesh.vertices) {
      lines.push(`${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
    }
    for (const [a, b, c] of mesh.faces) {
      lines.push(`3 ${a} ${b} ${c}`);
    }
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
  }

  if (format === 'ply') {
    const lines = [
      'ply',
      'format ascii 1.0',
      `element vertex ${mesh.vertices.length}`,
      'property float x',
      'property float y',
      'property float z',
      `element face ${mesh.faces.length}`,
      'property list uchar int vertex_indices',
      'end_header',
    ];
    for (const v of mesh.vertices) {
      lines.push(`${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
    }
    for (const [a, b, c] of mesh.faces) {
      lines.push(`3 ${a} ${b} ${c}`);
    }
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
  }

  if (format === 'stl') {
    // Binary STL
    const buf = Buffer.alloc(84 + mesh.faces.length * 50);
    buf.write('Aether Convert Binary STL', 0, 'ascii');
    buf.writeUInt32LE(mesh.faces.length, 80);
    let offset = 84;
    for (const [ia, ib, ic] of mesh.faces) {
      const a = mesh.vertices[ia] || { x: 0, y: 0, z: 0 };
      const b = mesh.vertices[ib] || { x: 0, y: 0, z: 0 };
      const c = mesh.vertices[ic] || { x: 0, y: 0, z: 0 };
      const n = computeFaceNormal(a, b, c);
      buf.writeFloatLE(n.x, offset);
      buf.writeFloatLE(n.y, offset + 4);
      buf.writeFloatLE(n.z, offset + 8);
      buf.writeFloatLE(a.x, offset + 12);
      buf.writeFloatLE(a.y, offset + 16);
      buf.writeFloatLE(a.z, offset + 20);
      buf.writeFloatLE(b.x, offset + 24);
      buf.writeFloatLE(b.y, offset + 28);
      buf.writeFloatLE(b.z, offset + 32);
      buf.writeFloatLE(c.x, offset + 36);
      buf.writeFloatLE(c.y, offset + 40);
      buf.writeFloatLE(c.z, offset + 44);
      buf.writeUInt16LE(0, offset + 48);
      offset += 50;
    }
    return buf;
  }

  if (format === 'x3d') {
    const points = mesh.vertices.map((v) => `${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`).join(' ');
    const indices = mesh.faces.map(([a, b, c]) => `${a} ${b} ${c} -1`).join(' ');
    return Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<X3D profile="Interchange" version="3.3">
  <Scene>
    <Shape>
      <IndexedFaceSet coordIndex="${indices}">
        <Coordinate point="${points}"/>
      </IndexedFaceSet>
    </Shape>
  </Scene>
</X3D>
`,
      'utf8'
    );
  }

  if (format === 'wrl') {
    const points = mesh.vertices.map((v) => `${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`).join(', ');
    const indices = mesh.faces.map(([a, b, c]) => `${a}, ${b}, ${c}, -1`).join(', ');
    return Buffer.from(
      `#VRML V2.0 utf8
Shape {
  geometry IndexedFaceSet {
    coord Coordinate {
      point [ ${points} ]
    }
    coordIndex [ ${indices} ]
  }
}
`,
      'utf8'
    );
  }

  if (format === 'gltf' || format === 'glb') {
    const posByteLen = mesh.vertices.length * 12;
    const idxByteLen = mesh.faces.length * 12; // uint32 indices
    const padPos = (4 - (posByteLen % 4)) % 4;
    const totalBin = posByteLen + padPos + idxByteLen;
    const bin = Buffer.alloc(totalBin);

    let o = 0;
    for (const v of mesh.vertices) {
      bin.writeFloatLE(v.x, o);
      bin.writeFloatLE(v.y, o + 4);
      bin.writeFloatLE(v.z, o + 8);
      o += 12;
    }
    o = posByteLen + padPos;
    for (const [a, b, c] of mesh.faces) {
      bin.writeUInt32LE(a, o);
      bin.writeUInt32LE(b, o + 4);
      bin.writeUInt32LE(c, o + 8);
      o += 12;
    }

    const gltf = {
      asset: { version: '2.0', generator: 'Aether Convert Mesh Engine' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
              indices: 1,
            },
          ],
        },
      ],
      buffers: [
        format === 'gltf'
          ? { uri: `data:application/octet-stream;base64,${bin.toString('base64')}`, byteLength: totalBin }
          : { byteLength: totalBin },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: posByteLen, target: 34962 },
        { buffer: 0, byteOffset: posByteLen + padPos, byteLength: idxByteLen, target: 34963 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: mesh.vertices.length,
          type: 'VEC3',
          min: [stats.boundsMin.x, stats.boundsMin.y, stats.boundsMin.z],
          max: [stats.boundsMax.x, stats.boundsMax.y, stats.boundsMax.z],
        },
        {
          bufferView: 1,
          componentType: 5125,
          count: mesh.faces.length * 3,
          type: 'SCALAR',
        },
      ],
    };

    if (format === 'gltf') {
      return Buffer.from(JSON.stringify(gltf, null, 2) + '\n', 'utf8');
    }

    const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    const paddedJsonLen = jsonBuf.length + jsonPad;
    const binPad = (4 - (bin.length % 4)) % 4;
    const paddedBinLen = bin.length + binPad;
    const totalLen = 12 + 8 + paddedJsonLen + 8 + paddedBinLen;

    const glb = Buffer.alloc(totalLen);
    glb.write('glTF', 0, 'ascii');
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(totalLen, 8);
    // JSON chunk
    glb.writeUInt32LE(paddedJsonLen, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    jsonBuf.copy(glb, 20);
    for (let i = 0; i < jsonPad; i++) glb[20 + jsonBuf.length + i] = 0x20;
    // BIN chunk
    const binChunkStart = 20 + paddedJsonLen;
    glb.writeUInt32LE(paddedBinLen, binChunkStart);
    glb.writeUInt32LE(0x004e4942, binChunkStart + 4);
    bin.copy(glb, binChunkStart + 8);
    return glb;
  }

  throw new Error(`Unsupported 3D mesh target format: ${format}`);
}

export function convertMesh(
  buffer: Buffer,
  sourceExt: string,
  targetExt: string,
  scale = 1
): { output: Buffer; stats: MeshStats; meshPreview: MeshData } {
  const parsed = parseMesh(buffer, sourceExt);
  if (parsed.vertices.length === 0) {
    throw new Error(`No mesh vertices found in ${sourceExt.toUpperCase()} file.`);
  }
  const scaled = scaleMesh(parsed, scale);
  const output = serializeMesh(scaled, targetExt);
  const stats = computeMeshStats(scaled);
  // Cap preview vertices/faces for fast client wireframe rendering
  const meshPreview: MeshData = {
    vertices: scaled.vertices.slice(0, 4000),
    faces: scaled.faces.slice(0, 4000).filter(([a, b, c]) => a < 4000 && b < 4000 && c < 4000),
  };
  return { output, stats, meshPreview };
}
