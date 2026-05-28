// The non-`box` node representations — the content drawn *inside* a morph
// target's bounding box. Each fills its `box` exactly (the container tween
// owns the box geometry); these only paint content, so a cross-fade between
// two representations is a clean opacity blend over a shared rectangle.
//
// MIRROR of packages/engine/src/components/NodeRepr.tsx. The `box`
// representation is NOT handled here — the caller keeps using <Card>.

import React from 'react';
import {Highlight} from 'prism-react-renderer';
import type {ResolvedStyle} from '@bjelser/kit';

import {codeTheme, glow, monoFamily} from '../../_shared';
import type {Box} from './_layout';
import type {NodeRepr as Repr, StructureNode} from './_types';

const CellGrid: React.FC<{
  box: Box;
  cells: (string | number)[][];
  accentHex: string;
  style: ResolvedStyle;
}> = ({box, cells, accentHex, style}) => {
  void accentHex;
  const {bg, ink} = style.tokens;
  const rows = Math.max(1, cells.length);
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const pad = 14;
  const gap = 8;
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  const cw = (innerW - gap * (cols - 1)) / cols;
  const ch = (innerH - gap * (rows - 1)) / rows;
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
              background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
              border: `1.5px solid ${bg.line}`,
              boxShadow: `0 10px 26px -22px #000000cc`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: monoFamily,
              fontSize,
              fontWeight: 500,
              color: ink.hi,
            }}
          >
            {cells[ri]?.[ci] ?? '—'}
          </div>
        )),
      )}
    </div>
  );
};

const CodeWindow: React.FC<{
  box: Box;
  node: StructureNode;
  accentHex: string;
  style: ResolvedStyle;
}> = ({box, node, accentHex, style}) => {
  const {bg, ink} = style.tokens;
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
        background: bg.panel,
        border: `1.5px solid ${bg.line}`,
        boxShadow: `0 18px 44px -24px #000000cc, 0 0 0 1px ${glow(accentHex, 0.12)}`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          height: headerH,
          background: bg.panelHi,
          borderBottom: `1px solid ${bg.line}`,
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
              color: ink.mid,
              letterSpacing: 0.3,
            }}
          >
            {node.tag}
          </div>
        ) : null}
      </div>

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
                      color: ink.faint,
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

// `as: 'equation'` — the author supplies markup in `node.expr`; the engine
// typesets it (serif, math-italic, centred). `expr` is NEVER evaluated.
const mathFamily = 'Latin Modern Math, STIX Two Math, Cambria Math, Georgia, serif';

const EquationPane: React.FC<{
  box: Box;
  node: StructureNode;
  accentHex: string;
  style: ResolvedStyle;
}> = ({box, node, accentHex, style}) => {
  const {bg, ink} = style.tokens;
  const expr = (node.expr ?? node.label ?? '').trim();
  const fontSize = Math.max(
    20,
    Math.min(54, box.h * 0.42, (box.w - 36) / Math.max(1, expr.length * 0.42)),
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: box.cx - box.w / 2,
        top: box.cy - box.h / 2,
        width: box.w,
        height: box.h,
        borderRadius: 14,
        background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
        border: `1.5px solid ${bg.line}`,
        boxShadow: `0 18px 44px -24px #000000cc, 0 0 0 1px ${glow(accentHex, 0.12)}`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 18px',
      }}
    >
      {node.tag ? (
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 12,
            letterSpacing: 1,
            color: accentHex,
          }}
        >
          {node.tag}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: mathFamily,
          fontStyle: 'italic',
          fontSize,
          fontWeight: 500,
          lineHeight: 1.15,
          color: ink.hi,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
        }}
      >
        {expr}
      </div>
    </div>
  );
};

export const NodeRepresentation: React.FC<{
  box: Box;
  node: StructureNode;
  accentHex: string;
  style: ResolvedStyle;
}> = ({box, node, accentHex, style}) => {
  const as: Repr = node.as ?? 'box';
  if (as === 'code')
    return <CodeWindow box={box} node={node} accentHex={accentHex} style={style} />;
  if (as === 'equation')
    return <EquationPane box={box} node={node} accentHex={accentHex} style={style} />;
  if (as === 'matrix' || as === 'vector' || as === 'grid') {
    return (
      <CellGrid box={box} cells={node.cells ?? []} accentHex={accentHex} style={style} />
    );
  }
  return null;
};
