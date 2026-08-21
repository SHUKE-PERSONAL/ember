export type AnsiStyle = {
  bold: boolean;
  foreground: number | null;
  background: number | null;
};

export type AnsiCell = {
  character: string;
  style: AnsiStyle;
};

export type AnsiLine = AnsiCell[];

const CP437_BOX_GLYPHS: Record<number, string> = {
  0xb3: '│',
  0xb4: '┤',
  0xb5: '╡',
  0xb6: '╢',
  0xb7: '╖',
  0xb8: '╕',
  0xb9: '╣',
  0xba: '║',
  0xbb: '╗',
  0xbc: '╝',
  0xbd: '╜',
  0xbe: '╛',
  0xbf: '┐',
  0xc0: '└',
  0xc1: '┴',
  0xc2: '┬',
  0xc3: '├',
  0xc4: '─',
  0xc5: '┼',
  0xc6: '╞',
  0xc7: '╟',
  0xc8: '╚',
  0xc9: '╔',
  0xca: '╩',
  0xcb: '╦',
  0xcc: '╠',
  0xcd: '═',
  0xce: '╬',
  0xcf: '╧',
  0xd0: '╨',
  0xd1: '╤',
  0xd2: '╥',
  0xd3: '╙',
  0xd4: '╘',
  0xd5: '╒',
  0xd6: '╓',
  0xd7: '╫',
  0xd8: '╪',
  0xd9: '┘',
  0xda: '┌',
  0xdb: '█',
  0xdc: '▄',
  0xdd: '▌',
  0xde: '▐',
  0xdf: '▀',
};

const initialStyle = (): AnsiStyle => ({
  bold: false,
  foreground: null,
  background: null,
});

const isGbkLead = (value: number) => value >= 0x81 && value <= 0xfe;
const isGbkTrail = (value: number) => value >= 0x40 && value <= 0xfe && value !== 0x7f;
const isBoxByte = (value: number) => value >= 0xb3 && value <= 0xdf;

function isBorderStart(bytes: Uint8Array, index: number) {
  return (bytes[index] === 0xc8 || bytes[index] === 0xc9) && isBoxByte(bytes[index + 1] ?? 0);
}

function decodeGbkPair(decoder: TextDecoder, lead: number, trail: number) {
  return decoder.decode(Uint8Array.of(lead, trail));
}

/**
 * SHUKE.ANS is a legacy mixed-codepage screen: CP437 draws the border while
 * the greeting is GBK Chinese. Both encodings reuse the same byte ranges, so
 * a valid GBK pair alone is not enough to identify text (for example, ╔═ is
 * also valid GBK bytes). In this recovered screen, each CP437 border run is
 * introduced by ╔ or ╚; preserve that run and decode other valid pairs as GBK.
 * This keeps the original border and greeting intact.
 */
export function decodeMixedAnsi(bytes: Uint8Array) {
  const gbk = new TextDecoder('gbk');
  let output = '';
  let borderMode = false;

  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (isBorderStart(bytes, index)) borderMode = true;

    if (borderMode && isBoxByte(value)) {
      output += CP437_BOX_GLYPHS[value] ?? String.fromCharCode(value);
      continue;
    }

    if (isGbkLead(value) && isGbkTrail(bytes[index + 1] ?? 0)) {
      output += decodeGbkPair(gbk, value, bytes[index + 1]);
      index += 1;
      continue;
    }

    if (isBoxByte(value)) {
      output += CP437_BOX_GLYPHS[value] ?? String.fromCharCode(value);
      continue;
    }

    output += String.fromCharCode(value);
    borderMode = false;
  }

  return output;
}

function applySgr(style: AnsiStyle, parameters: number[]) {
  const next = { ...style };
  for (const parameter of parameters.length > 0 ? parameters : [0]) {
    if (parameter === 0) {
      next.bold = false;
      next.foreground = null;
      next.background = null;
    } else if (parameter === 1) {
      next.bold = true;
    } else if (parameter === 22) {
      next.bold = false;
    } else if (parameter === 39) {
      next.foreground = null;
    } else if (parameter === 49) {
      next.background = null;
    } else if (parameter >= 30 && parameter <= 37) {
      next.foreground = parameter - 30;
    } else if (parameter >= 40 && parameter <= 47) {
      next.background = parameter - 40;
    } else if (parameter >= 90 && parameter <= 97) {
      next.foreground = parameter - 90 + 8;
    } else if (parameter >= 100 && parameter <= 107) {
      next.background = parameter - 100 + 8;
    }
  }
  return next;
}

function addText(lines: AnsiLine[], bytes: Uint8Array, style: AnsiStyle) {
  const text = decodeMixedAnsi(bytes);
  const line = lines[lines.length - 1];
  for (const character of text) line.push({ character, style: { ...style } });
}

/** Parse ANSI SGR escapes and CRLF text into styled screen lines. */
export function parseAnsiScreen(bytes: Uint8Array): AnsiLine[] {
  const lines: AnsiLine[] = [[]];
  let style = initialStyle();
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) addText(lines, bytes.slice(textStart, end), style);
  };

  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (value === 0x1b && bytes[index + 1] === 0x5b) {
      const terminator = bytes.indexOf(0x6d, index + 2);
      if (terminator !== -1) {
        flushText(index);
        const parameters = new TextDecoder().decode(bytes.slice(index + 2, terminator))
          .split(';')
          .filter(Boolean)
          .map(Number);
        style = applySgr(style, parameters);
        index = terminator;
        textStart = index + 1;
        continue;
      }
    }

    if (value === 0x0d || value === 0x0a) {
      flushText(index);
      if (value === 0x0a) lines.push([]);
      textStart = index + 1;
    }
  }
  flushText(bytes.length);

  if (lines.length > 1 && lines.at(-1)?.length === 0) lines.pop();
  return lines;
}

export function ansiStyleClass(style: AnsiStyle) {
  const classes = ['ansi-cell'];
  if (style.bold) classes.push('ansi-bold');
  if (style.foreground !== null) classes.push(`ansi-fg-${style.foreground}`);
  if (style.background !== null) classes.push(`ansi-bg-${style.background}`);
  return classes.join(' ');
}
