import {
  DirectiveNode,
  DocumentNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  Kind,
  SelectionSetNode,
  visit,
} from 'graphql';

import { Request } from '@graphql-tools/utils';

import { Transform, DelegationContext } from '../types';

export default class StoreDeferredSelectionSets implements Transform {
  private labelNumber: number;

  constructor() {
    this.labelNumber = 0;
  }

  public transformRequest(
    originalRequest: Request,
    delegationContext: DelegationContext,
    _transformationContext: Record<string, any>
  ): Request {
    const { deferredSelectionSets } = delegationContext;
    return {
      ...originalRequest,
      document: this.storeDeferredSelectionSets(originalRequest.document, deferredSelectionSets),
    };
  }

  private storeDeferredSelectionSets(
    document: DocumentNode,
    deferredSelectionSets: Record<string, SelectionSetNode>
  ): DocumentNode {
    const fragmentSelectionSets: Record<string, SelectionSetNode> = Object.create(null);

    document.definitions.forEach(def => {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentSelectionSets[def.name.value] = filterSelectionSet(def.selectionSet);
      }
    });

    return visit(document, {
      [Kind.INLINE_FRAGMENT]: node => {
        const newNode = transformFragmentNode(node, this.labelNumber);

        if (newNode === undefined) {
          return;
        }

        deferredSelectionSets[this.labelNumber] = filterSelectionSet(node.selectionSet);

        this.labelNumber++;

        return newNode;
      },
      [Kind.FRAGMENT_SPREAD]: node => {
        const newNode = transformFragmentNode(node, this.labelNumber);

        if (newNode === undefined) {
          return;
        }

        deferredSelectionSets[this.labelNumber] = fragmentSelectionSets[node.name.value];

        this.labelNumber++;

        return newNode;
      },
    });
  }
}

function transformFragmentNode<T extends InlineFragmentNode | FragmentSpreadNode>(node: T, labelNumber: number): T {
  const deferIndex = node.directives?.findIndex(directive => directive.name.value === 'defer');
  if (deferIndex === undefined || deferIndex === -1) {
    return;
  }

  const defer = node.directives[deferIndex];

  let newDefer: DirectiveNode;

  const args = defer.arguments;
  const labelIndex = args?.findIndex(arg => arg.name.value === 'label');
  const newLabel = {
    kind: Kind.ARGUMENT,
    name: {
      kind: Kind.NAME,
      value: 'label',
    },
    value: {
      kind: Kind.STRING,
      value: `label_${labelNumber}`,
    },
  };

  if (labelIndex === undefined) {
    newDefer = {
      ...defer,
      arguments: [],
    };
  } else if (labelIndex === -1) {
    newDefer = {
      ...defer,
      arguments: [...args, newLabel],
    };
  } else {
    newDefer = {
      ...defer,
      arguments: args.slice().splice(labelIndex, 1, newLabel),
    };
  }

  return {
    ...node,
    directives: node.directives.slice().splice(deferIndex, 1, newDefer),
  };
}

function filterSelectionSet(selectionSet: SelectionSetNode): SelectionSetNode {
  return {
    ...selectionSet,
    selections: selectionSet.selections.filter(
      selection =>
        selection.directives === undefined ||
        !selection.directives.some(directive => directive.name.value === 'defer' || directive.name.value === 'undefer')
    ),
  };
}
