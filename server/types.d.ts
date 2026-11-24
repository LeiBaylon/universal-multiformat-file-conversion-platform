declare module 'opentype.js' {
  const opentype: {
    parse(buffer: ArrayBuffer): {
      numGlyphs: number;
      unitsPerEm: number;
      names: { fontFamily?: { en?: string }; fontSubfamily?: { en?: string } };
    };
  };
  export = opentype;
}

declare module '7zip-bin' {
  export const path7za: string;
  export const path7x: string;
}

declare module 'archiver-zip-encrypted' {
  const zipEncrypted: unknown;
  export = zipEncrypted;
}
