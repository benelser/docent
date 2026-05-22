import type {PrismTheme} from 'prism-react-renderer';

// Syntax theme for code scenes — tuned to the dark-console palette.
export const codeTheme: PrismTheme = {
  plain: {color: '#dfe4ee', backgroundColor: 'transparent'},
  styles: [
    {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: '#5b6373', fontStyle: 'italic'}},
    {types: ['punctuation'], style: {color: '#8a93a6'}},
    {types: ['operator'], style: {color: '#9aa3b5'}},
    {types: ['keyword', 'rule', 'important', 'atrule'], style: {color: '#b69cff'}},
    {types: ['string', 'char', 'attr-value', 'inserted'], style: {color: '#5fe8a4'}},
    {types: ['number', 'boolean', 'constant', 'symbol'], style: {color: '#ffc24d'}},
    {types: ['function', 'function-variable'], style: {color: '#5cb6ff'}},
    {types: ['class-name', 'builtin', 'maybe-class-name'], style: {color: '#3fe0d0'}},
    {types: ['attr-name', 'property', 'variable'], style: {color: '#ff9bb0'}},
    {types: ['macro', 'namespace'], style: {color: '#ffc24d'}},
    {types: ['lifetime-annotation', 'lifetime'], style: {color: '#ff7d97'}},
    {types: ['deleted'], style: {color: '#ff7d97'}},
  ],
};
