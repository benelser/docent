// Judge dimensions contributed by the tree scene plugin.
//
// Ported behaviorally from the `hierarchy-meaningful` dimension in
// packages/engine/cli/judge.ts (around lines 76-80):
//
//   "Hierarchy meaningful — the levels carry information; depth is not
//    decorative."
//
// The judge surfaces this dimension only when the film carries a tree
// scene; films without one mark it n/a. The kit's judge framework
// aggregates dimensions across registered plugins.
//
// Where the depthcheck rule (`tree-discriminates`, in ./depth-rules.ts)
// catches the regex-shaped failure — every node has 0 or 1 child — this
// dimension catches what only judgement can: a tree that branches
// mechanically but whose levels restate each other (the labels at depth 2
// repeat the noun at depth 1 with a synonym), or whose depth is forced —
// shallow content padded with intermediate nodes to make it look like a
// hierarchy. The branching is necessary but not sufficient; the levels
// must carry distinct information.

import type {JudgeDimension} from '@bjelser/kit';

const hierarchyMeaningful: JudgeDimension = {
  id: 'hierarchy-meaningful',
  title:
    'Hierarchy meaningful — the levels carry information; depth is not decorative',
  description:
    'A tree scene exists to argue from a classification axis: depth encodes kingdom→phylum→class, model→toolset→orchestrator, parent→child. The dimension fails when depth is decoration — only one node per level (caught structurally as a chain), or levels that restate the level above (the child labels are the parent\'s label with a suffix), or padded intermediate nodes that add no taxonomic step. The dimension passes when each level introduces a genuinely different unit of categorization — the labels at depth 2 say something the labels at depth 1 did not, and the branching reflects a real-world taxonomy or a real reporting structure.',
  rubric: [
    'Pass: every level of the tree carries a distinct unit of categorization. Sibling labels at the same level are members of one category; child labels refine the parent\'s category along a real dimension. The viewer learns from depth — collapsing the tree into a flat list would lose information.',
    'Fail: depth is decorative. Either the tree is degenerate (no branching, caught by the depthcheck — duplicated here as a judgement floor), OR every interior level restates the level above in different words, OR intermediate nodes are inserted purely to add depth without contributing a taxonomic step. The viewer learns nothing the leaf list alone wouldn\'t have shown.',
    'n/a: the film has no tree scene.',
  ].join('\n\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [hierarchyMeaningful];

export default judgeDimensions;
