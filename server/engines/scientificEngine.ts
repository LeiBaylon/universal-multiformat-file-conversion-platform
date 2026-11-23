export interface Atom {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface Bond {
  from: number; // 1-based
  to: number;
  order: number;
}

export interface Molecule {
  title: string;
  atoms: Atom[];
  bonds: Bond[];
}

export interface BioSequence {
  id: string;
  description: string;
  sequence: string;
  quality?: string;
}

export function parseMolecule(input: string, ext: string): Molecule {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const format = ext.toLowerCase();

  if (format === 'xyz') {
    const count = parseInt(lines[0]?.trim() || '0', 10);
    const title = lines[1]?.trim() || 'Molecule';
    const atoms: Atom[] = [];
    for (let i = 2; i < lines.length && atoms.length < (count || Infinity); i++) {
      const p = lines[i].trim().split(/\s+/);
      if (p.length >= 4) {
        atoms.push({ element: p[0], x: Number(p[1]) || 0, y: Number(p[2]) || 0, z: Number(p[3]) || 0 });
      }
    }
    return { title, atoms, bonds: [] };
  }

  if (format === 'mol' || format === 'sdf') {
    const title = lines[0]?.trim() || 'Molecule';
    const countsLine = lines[3] || '';
    const atomCount = parseInt(countsLine.slice(0, 3).trim(), 10) || Number(countsLine.trim().split(/\s+/)[0]) || 0;
    const bondCount = parseInt(countsLine.slice(3, 6).trim(), 10) || Number(countsLine.trim().split(/\s+/)[1]) || 0;
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    for (let i = 4; i < 4 + atomCount && i < lines.length; i++) {
      const p = lines[i].trim().split(/\s+/);
      if (p.length >= 4) {
        atoms.push({ x: Number(p[0]) || 0, y: Number(p[1]) || 0, z: Number(p[2]) || 0, element: p[3] });
      }
    }
    for (let i = 4 + atomCount; i < 4 + atomCount + bondCount && i < lines.length; i++) {
      const p = lines[i].trim().split(/\s+/);
      if (p.length >= 3) {
        bonds.push({ from: Number(p[0]), to: Number(p[1]), order: Number(p[2]) || 1 });
      }
    }
    return { title, atoms, bonds };
  }

  if (format === 'cif') {
    const atoms: Atom[] = [];
    let title = 'Crystal Structure';
    for (const raw of lines) {
      const l = raw.trim();
      if (l.startsWith('data_')) title = l.slice(5) || title;
      if (!l || l.startsWith('#') || l.startsWith('_') || l.startsWith('loop_') || l.startsWith('data_')) continue;
      const p = l.split(/\s+/);
      if (p.length >= 5 && /^[A-Z][a-z]?$/.test(p[1])) {
        atoms.push({ element: p[1], x: Number(p[2]) || 0, y: Number(p[3]) || 0, z: Number(p[4]) || 0 });
      }
    }
    return { title, atoms, bonds: [] };
  }

  throw new Error(`Unsupported molecular input format: ${ext}`);
}

export function serializeMolecule(mol: Molecule, targetExt: string): string {
  const format = targetExt.toLowerCase();
  if (format === 'xyz') {
    const body = mol.atoms
      .map((a) => `${a.element.padEnd(3)} ${a.x.toFixed(6).padStart(12)} ${a.y.toFixed(6).padStart(12)} ${a.z.toFixed(6).padStart(12)}`)
      .join('\n');
    return `${mol.atoms.length}\n${mol.title}\n${body}\n`;
  }

  if (format === 'mol' || format === 'sdf') {
    const counts = `${String(mol.atoms.length).padStart(3)}${String(mol.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`;
    const atomLines = mol.atoms.map(
      (a) =>
        `${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.element.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`
    );
    const bondLines = mol.bonds.map(
      (b) => `${String(b.from).padStart(3)}${String(b.to).padStart(3)}${String(b.order).padStart(3)}  0  0  0  0`
    );
    const tail = format === 'sdf' ? 'M  END\n$$$$\n' : 'M  END\n';
    return `${mol.title}\n  AetherConvert\n\n${counts}\n${[...atomLines, ...bondLines].join('\n')}\n${tail}`;
  }

  if (format === 'cif') {
    const header = `data_${mol.title.replace(/\s+/g, '_')}\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_Cartn_x\n_atom_site_Cartn_y\n_atom_site_Cartn_z\n`;
    const rows = mol.atoms.map(
      (a, idx) => `${a.element}${idx + 1} ${a.element} ${a.x.toFixed(5)} ${a.y.toFixed(5)} ${a.z.toFixed(5)}`
    );
    return header + rows.join('\n') + '\n';
  }

  if (format === 'json') {
    return JSON.stringify(mol, null, 2) + '\n';
  }

  throw new Error(`Unsupported molecular target format: ${targetExt}`);
}

export function parseBioSequences(input: string, ext: string): BioSequence[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const format = ext.toLowerCase();
  const sequences: BioSequence[] = [];

  if (format === 'fasta') {
    let current: BioSequence | null = null;
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('>')) {
        if (current) sequences.push(current);
        const header = l.slice(1).trim();
        const [id, ...rest] = header.split(/\s+/);
        current = { id: id || 'seq', description: rest.join(' '), sequence: '' };
      } else if (current) {
        current.sequence += l;
      }
    }
    if (current) sequences.push(current);
    return sequences;
  }

  if (format === 'fastq') {
    for (let i = 0; i + 3 < lines.length; i += 4) {
      const h = lines[i].trim();
      if (!h.startsWith('@')) continue;
      const [id, ...rest] = h.slice(1).split(/\s+/);
      sequences.push({
        id: id || `read_${i / 4 + 1}`,
        description: rest.join(' '),
        sequence: lines[i + 1].trim(),
        quality: lines[i + 3].trim(),
      });
    }
    return sequences;
  }

  throw new Error(`Unsupported sequence format: ${ext}`);
}

export function serializeBioSequences(seqs: BioSequence[], targetExt: string): string {
  const format = targetExt.toLowerCase();
  if (format === 'fasta') {
    return (
      seqs
        .map((s) => `>${s.id}${s.description ? ' ' + s.description : ''}\n${s.sequence.match(/.{1,80}/g)?.join('\n') || ''}`)
        .join('\n') + '\n'
    );
  }
  if (format === 'fastq') {
    return (
      seqs
        .map((s) => {
          const qual = s.quality && s.quality.length === s.sequence.length ? s.quality : 'I'.repeat(s.sequence.length);
          return `@${s.id}${s.description ? ' ' + s.description : ''}\n${s.sequence}\n+\n${qual}`;
        })
        .join('\n') + '\n'
    );
  }
  if (format === 'json') {
    return JSON.stringify(seqs, null, 2) + '\n';
  }
  if (format === 'csv') {
    const rows = ['id,description,length,sequence'];
    for (const s of seqs) {
      rows.push(`"${s.id.replace(/"/g, '""')}","${s.description.replace(/"/g, '""')}",${s.sequence.length},"${s.sequence}"`);
    }
    return rows.join('\n') + '\n';
  }
  throw new Error(`Unsupported target sequence format: ${targetExt}`);
}

export function convertScientificContent(input: string, sourceExt: string, targetExt: string): { output: string; summary: Record<string, number | string> } {
  const src = sourceExt.toLowerCase();
  if (['xyz', 'mol', 'sdf', 'cif'].includes(src)) {
    const mol = parseMolecule(input, src);
    if (mol.atoms.length === 0) throw new Error(`No atomic coordinates parsed from ${src.toUpperCase()} file.`);
    return {
      output: serializeMolecule(mol, targetExt),
      summary: { title: mol.title, atoms: mol.atoms.length, bonds: mol.bonds.length },
    };
  }
  if (['fasta', 'fastq'].includes(src)) {
    const seqs = parseBioSequences(input, src);
    if (seqs.length === 0) throw new Error(`No biological sequences parsed from ${src.toUpperCase()} file.`);
    return {
      output: serializeBioSequences(seqs, targetExt),
      summary: { sequences: seqs.length, totalBases: seqs.reduce((acc, s) => acc + s.sequence.length, 0) },
    };
  }
  throw new Error(`Unsupported scientific format: ${sourceExt}`);
}
