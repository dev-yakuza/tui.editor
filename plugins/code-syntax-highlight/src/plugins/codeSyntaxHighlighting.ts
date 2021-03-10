import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as ProsemirrorNode } from 'prosemirror-model';

import * as Hljs from 'highlight.js';
import * as Low from 'lowlight/lib/core';

interface ChildNodeInfo {
  node: ProsemirrorNode;
  pos: number;
}

interface HighlightedNodeInfo {
  text: string;
  classes: string[];
}

function flatten<T>(arr: T[]): T[] {
  return arr.reduce<T[]>((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);
}

function findCodeBlocks(doc: ProsemirrorNode) {
  const descendants: ChildNodeInfo[] = [];

  doc.descendants((node, pos) => {
    if (node.isBlock && node.type.name === 'codeBlock') {
      descendants.push({ node, pos });
    }
  });

  return descendants;
}

function parseNodes(nodes: any[], classNames: string[] = []): HighlightedNodeInfo[] {
  return nodes.map((node) => {
    const classes: string[] = [
      ...classNames,
      ...(node.properties ? node.properties.className : []),
    ];

    if (node.children) {
      return parseNodes(node.children, classes);
    }

    return {
      text: node.value,
      classes,
    };
  }) as HighlightedNodeInfo[];
}

function getDecorations(doc: ProsemirrorNode, hljs: typeof Hljs, low: typeof Low) {
  const decorations: Decoration[] = [];
  const codeBlocks = findCodeBlocks(doc);

  codeBlocks.forEach(({ pos, node }) => {
    let startPos = pos + 1;

    const { language } = node.attrs;
    const registeredLang = hljs.getLanguage(language);
    const tree = registeredLang ? low.highlight(language, node.textContent).value : [];
    const nodeInfos = flatten(parseNodes(tree)) as HighlightedNodeInfo[];

    nodeInfos
      .map((nodeInfo) => {
        const from = startPos;
        const to = from + nodeInfo.text.length;

        startPos = to;

        return { ...nodeInfo, from, to };
      })
      .forEach(({ classes, from, to }) => {
        const classNames = classes.join(' ');
        const decoration = Decoration.inline(from, to, {
          class: classNames,
        });

        if (classNames.length) {
          decorations.push(decoration);
        }
      });
  });

  return DecorationSet.create(doc, decorations);
}

export function codeSyntaxHighlighting(hljs: typeof Hljs, low: typeof Low) {
  return new Plugin({
    state: {
      init(_, { doc }) {
        return getDecorations(doc, hljs, low);
      },
      apply(tr, set) {
        if (!tr.docChanged) {
          return set.map(tr.mapping, tr.doc);
        }

        return getDecorations(tr.doc, hljs, low);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}