import React from 'react';
import {Highlight} from 'prism-react-renderer';
import {theme, glow} from '../theme';
import {monoFamily} from '../fonts';
import {codeTheme} from './code-theme';
import type {Box} from '../engine/layout';
import type {Node, NodeRepr as Repr} from '../engine/spec';

// The non-`box` node representations — the content drawn *inside* a morph
// target's bounding box. Each fills its `box` exactly (the container tween
// owns the box geometry); these only paint content, so a cross-fade between
// two representations is a clean opacity blend over a shared rectangle.
//
// `box` is unchanged — it stays the existing <Card>. These are the new
// representations a node can morph *into*: a grid of mono cells
// (`matrix`/`vector`/`grid`) or a small code window (`code`).

// A grid of mono cells — the matrix/vector/grid representation. Lifted from
// QuantitiesScene's matrix cell styling, sized to fit the node's box.
const CellGrid: React.FC<{
  box: Box;
  cells: (string | number)[][];
  accentHex: string;
}> = ({box, cells, accentHex}) => {
  const rows = Math.max(1, cells.length);
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const pad = 14;
  const gap = 8;
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  const cw = (innerW - gap * (cols - 1)) / cols;
  const ch = (innerH - gap * (rows - 1)) / rows;
  // The cell value font shrinks to fit the smaller of the cell's dimensions.
  const fontSize = Math.max(12, Math.min(26, ch * 0.5, cw * 0.42));

  return (
    <div
      style={{
        position: 'absolute',
        left: box.cx - box.w / 2,
        top: box.cy - box.h / 2,
        width: box.w,
        height: box.h,
        padding: pad,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap,
        boxSizing: 'border-box',
      }}
    >
      {Array.from({length: rows}).flatMap((_r, ri) =>
        Array.from({length: cols}).map((_c, ci) => (
          <div
            key={`${ri}-${ci}`}
            style={{
              borderRadius: 9,
              background: `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
              border: `1.5px solid ${theme.bg.line}`,
              boxShadow: `0 10px 26px -22px #000000cc`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: monoFamily,
              fontSize,
              fontWeight: 500,
              color: theme.ink.hi,
            }}
          >
            {cells[ri]?.[ci] ?? '—'}
          </div>
        )),
      )}
    </div>
  );
};

// A small code window — the `code` representation. A compact form of
// CloseupScene's window, sized to fit the node's box.
const CodeWindow: React.FC<{
  box: Box;
  node: Node;
  accentHex: string;
}> = ({box, node, accentHex}) => {
  const code = (node.sub ?? node.label ?? '').replace(/\s+$/, '');
  const lineCount = Math.max(1, code.split('\n').length);
  const headerH = 30;
  const padY = 12;
  const lineH = Math.max(
    14,
    Math.min(26, (box.h - headerH - padY * 2) / lineCount),
  );
  const fontSize = Math.max(11, Math.min(18, lineH * 0.62));

  return (
    <div
      style={{
        position: 'absolute',
        left: box.cx - box.w / 2,
        top: box.cy - box.h / 2,
        width: box.w,
        height: box.h,
        borderRadius: 14,
        overflow: 'hidden',
        background: theme.bg.panel,
        border: `1.5px solid ${theme.bg.line}`,
        boxShadow: `0 18px 44px -24px #000000cc, 0 0 0 1px ${glow(accentHex, 0.12)}`,
        boxSizing: 'border-box',
      }}
    >
      {/* window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          height: headerH,
          background: theme.bg.panelHi,
          borderBottom: `1px solid ${theme.bg.line}`,
        }}
      >
        <div style={{display: 'flex', gap: 6}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div
              key={c}
              style={{width: 9, height: 9, borderRadius: 5, background: c, opacity: 0.9}}
            />
          ))}
        </div>
        {node.tag ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 12,
              color: theme.ink.mid,
              letterSpacing: 0.3,
            }}
          >
            {node.tag}
          </div>
        ) : null}
      </div>

      {/* code body */}
      <div style={{padding: `${padY}px 0`}}>
        <Highlight theme={codeTheme} code={code} language={'tsx' as never}>
          {({tokens, getTokenProps}) => (
            <div style={{fontFamily: monoFamily, fontSize, lineHeight: `${lineH}px`}}>
              {tokens.map((line, i) => (
                <div key={i} style={{display: 'flex'}}>
                  <span
                    style={{
                      width: 38,
                      textAlign: 'right',
                      paddingRight: 12,
                      color: theme.ink.faint,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{flex: 1, whiteSpace: 'pre', overflow: 'hidden'}}>
                    {line.map((token, j) => (
                      <span key={j} {...getTokenProps({token})} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Highlight>
      </div>
    </div>
  );
};

// The dispatch: render a node's content for a non-`box` representation. The
// `box` representation is NOT handled here — the caller keeps using <Card>.
export const NodeRepresentation: React.FC<{
  box: Box;
  node: Node;
  accentHex: string;
}> = ({box, node, accentHex}) => {
  const as: Repr = node.as ?? 'box';
  if (as === 'code') return <CodeWindow box={box} node={node} accentHex={accentHex} />;
  if (as === 'matrix' || as === 'vector' || as === 'grid') {
    return <CellGrid box={box} cells={node.cells ?? []} accentHex={accentHex} />;
  }
  return null;
};
