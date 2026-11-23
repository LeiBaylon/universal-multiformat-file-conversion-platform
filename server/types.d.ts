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
