import { useEffect, useRef } from 'react';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface MeshPreviewData {
  vertices: Vec3[];
  faces: [number, number, number][];
}

export function MeshPreviewCanvas({ mesh }: { mesh: MeshPreviewData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh?.vertices?.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Normalize mesh to unit sphere centered at origin
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of mesh.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.0001);
    const scale = (Math.min(w, h) * 0.65) / span;

    const renderFrame = (angleY: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, w, h);

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const pitch = 0.35;
      const cosX = Math.cos(pitch);
      const sinX = Math.sin(pitch);

      const projected = mesh.vertices.map((v) => {
        const x = (v.x - cx) * scale;
        const y = (v.y - cy) * scale;
        const z = (v.z - cz) * scale;
        const rx = x * cosY - z * sinY;
        const rz = x * sinY + z * cosY;
        const ry = y * cosX - rz * sinX;
        const finalZ = y * sinX + rz * cosX;
        const persp = 420 / (420 + finalZ * 0.5);
        return {
          px: w / 2 + rx * persp,
          py: h / 2 - ry * persp,
          pz: finalZ,
        };
      });

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;

      const sortedFaces = mesh.faces
        .map(([a, b, c]) => {
          const pa = projected[a];
          const pb = projected[b];
          const pc = projected[c];
          if (!pa || !pb || !pc) return null;
          return { pa, pb, pc, depth: (pa.pz + pb.pz + pc.pz) / 3 };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => b.depth - a.depth);

      for (const f of sortedFaces) {
        ctx.beginPath();
        ctx.moveTo(f.pa.px, f.pa.py);
        ctx.lineTo(f.pb.px, f.pb.py);
        ctx.lineTo(f.pc.px, f.pc.py);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.stroke();
      }
    };

    renderFrame(0.6);
  }, [mesh]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/15 bg-[#080808]">
      <canvas
        ref={canvasRef}
        width={480}
        height={260}
        data-testid="mesh-preview-canvas"
        className="w-full h-[220px] object-contain block"
      />
      <div className="px-3 py-2 border-t border-white/10 text-xs text-[#A1A1A1] flex items-center justify-between tabular-nums">
        <span>Wireframe Projection</span>
        <span>{mesh.vertices.length} vertices · {mesh.faces.length} faces</span>
      </div>
    </div>
  );
}
