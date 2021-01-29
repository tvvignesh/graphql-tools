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
      // TO DO:
      // the need for the __typename within any selection set that contains deferred fragments
      // further argues in favor of adding __typename once to every field instead of via this method.
      // see https://github.com/ardatan/graphql-tools/pull/2225
      [Kind.SELECTION_SET]: node => {
        if (
          node.selections.some(
            selection =>
              (selection.kind === Kind.INLINE_FRAGMENT || selection.kind === Kind.FRAGMENT_SPREAD) &&
              selection.directives?.some(directive => directive.name.value === 'defer')
          )
        ) {
          return {
            ...node,
            selections: [
              ...node.selections,
              {
                kind: Kind.FIELD,
                name: {
                  kind: Kind.NAME,
                  value: '__typename',
                },
              },
            ],
          };
        }
      },
      [Kind.INLINE_FRAGMENT]: node => {
        const newNode = transformFragmentNode(node, this.labelNumber);

        if (newNode === undefined) {
          return;
        }

        deferredSelectionSets[`label_${this.labelNumber}`] = filterSelectionSet(node.selectionSet);

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
      arguments: [newLabel],
    };
  } else if (labelIndex === -1) {
    newDefer = {
      ...defer,
      arguments: [...args, newLabel],
    };
  } else {
    const newArgs = args.slice();
    newArgs.splice(labelIndex, 1, newLabel);
    newDefer = {
      ...defer,
      arguments: newArgs,
    };
  }

  const newDirectives = node.directives.slice();
  newDirectives.splice(deferIndex, 1, newDefer);

  return {
    ...node,
    directives: newDirectives,
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
