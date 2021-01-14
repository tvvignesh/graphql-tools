import {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  Kind,
  SelectionNode,
  InlineFragmentNode,
  visit,
  FragmentSpreadNode,
  FieldNode,
} from 'graphql';

import { Request } from '@graphql-tools/utils';

import { Transform, DelegationContext } from '../types';

export default class UndeferSelections implements Transform {
  public transformRequest(
    originalRequest: Request,
    _delegationContext: DelegationContext,
    _transformationContext: Record<string, any>
  ): Request {
    return {
      ...originalRequest,
      document: this.undeferDocument(originalRequest.document),
    };
  }

  private undeferDocument(document: DocumentNode): DocumentNode {
    const deferredNamedFragments: Array<string> = [];

    let newDocument: DocumentNode = visit(document, {
      [Kind.OPERATION_DEFINITION]: node => undeferNodeWithSelectionSet(node),
      [Kind.FIELD]: node => undeferNodeWithSelectionSet(node),
      [Kind.FRAGMENT_SPREAD]: node => {
        const directives = node.directives;
        if (directives && directives.some(directive => directive.name.value === 'defer')) {
          deferredNamedFragments.push(node.name.value);
        }
      },
    });

    const operations: Array<OperationDefinitionNode> = [];
    const fragments: Record<string, FragmentDefinitionNode> = Object.create(null);

    newDocument.definitions.forEach(def => {
      if (def.kind === Kind.OPERATION_DEFINITION) {
        operations.push(def);
      } else {
        fragments[(def as FragmentDefinitionNode).name.value] = def as FragmentDefinitionNode;
      }
    });

    const newFragments: Array<FragmentDefinitionNode> = deferredNamedFragments.reduce((acc, fragmentName) => {
      const fragment = fragments[fragmentName];
      acc.push(...splitFragmentDef(fragment));
      return acc;
    }, []);

    newDocument = {
      ...document,
      definitions: [
        ...operations,
        ...Object.values(fragments).map(fragment => undeferNodeWithSelectionSet(fragment)),
        ...newFragments,
      ],
    };

    newDocument = visit(newDocument, {
      [Kind.FIELD]: node => removeUndeferDirective(node),
      [Kind.FRAGMENT_SPREAD]: node => removeUndeferDirective(node),
      [Kind.INLINE_FRAGMENT]: node => removeUndeferDirective(node),
    });

    return newDocument;
  }
}

function removeUndeferDirective<T extends FieldNode | FragmentSpreadNode | InlineFragmentNode>(node: T): T {
  const directives = node.directives;
  if (directives != null) {
    return {
      ...node,
      directives: directives.filter(directive => directive.name.value !== 'undefer'),
    };
  }

  return node;
}

function undeferNodeWithSelectionSet<
  T extends FieldNode | OperationDefinitionNode | FragmentDefinitionNode | InlineFragmentNode
>(node: T): T {
  const selectionSet = node.selectionSet;
  if (selectionSet != null) {
    const newSelections: Array<SelectionNode> = [];
    selectionSet.selections.forEach(selection => {
      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const directives = selection.directives;
        if (directives && directives.some(directive => directive.name.value === 'defer')) {
          newSelections.push(...duplicateFragmentSpread(selection));
        } else {
          newSelections.push(selection);
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const directives = selection.directives;
        if (directives && directives.some(directive => directive.name.value === 'defer')) {
          const [deferredFragment, undeferredFragment] = splitInlineFragment(selection);
          if (deferredFragment.selectionSet.selections.length) {
            newSelections.push(deferredFragment);
          }
          if (undeferredFragment.selectionSet.selections.length) {
            newSelections.push(undeferredFragment);
          }
        } else {
          newSelections.push(undeferNodeWithSelectionSet(selection));
        }
      } else {
        newSelections.push(selection);
      }
    });

    return {
      ...node,
      selectionSet: {
        ...selectionSet,
        selections: newSelections,
      },
    };
  }
  return node;
}

function splitSelections(
  originalSelections: ReadonlyArray<SelectionNode>
): [Array<SelectionNode>, Array<SelectionNode>] {
  const deferredSelections: Array<SelectionNode> = [];
  const undeferredSelections: Array<SelectionNode> = [];

  originalSelections.forEach(selection => {
    const directives = selection.directives;
    if (directives && directives.some(directive => directive.name.value === 'undefer')) {
      undeferredSelections.push(selection);
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const [deferredFragment, undeferredFragment] = duplicateFragmentSpread(selection);
      deferredSelections.push(deferredFragment);
      undeferredSelections.push(undeferredFragment);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const [deferredFragment, undeferredFragment] = splitInlineFragment(selection);
      if (deferredFragment.selectionSet.selections.length) {
        deferredSelections.push(deferredFragment);
      }
      if (undeferredFragment.selectionSet.selections.length) {
        undeferredSelections.push(undeferredFragment);
      }
    } else {
      deferredSelections.push(selection);
    }
  });

  return [deferredSelections, undeferredSelections];
}

function splitFragmentDef(originalFragment: FragmentDefinitionNode): Array<FragmentDefinitionNode> {
  const fragmentName = originalFragment.name.value;
  const deferredFragmentName = `__Deferred__${fragmentName}`;
  const undeferredFragmentName = `__Undeferred__${fragmentName}`;

  const [deferredSelections, undeferredSelections] = splitSelections(originalFragment.selectionSet.selections);

  const directives = originalFragment.directives;
  return [
    {
      ...originalFragment,
      name: {
        ...originalFragment.name,
        value: deferredFragmentName,
      },
      selectionSet: {
        ...originalFragment.selectionSet,
        selections: deferredSelections,
      },
    },
    {
      ...originalFragment,
      name: {
        ...originalFragment.name,
        value: undeferredFragmentName,
      },
      selectionSet: {
        ...originalFragment.selectionSet,
        selections: undeferredSelections,
      },
      directives: directives ? directives.filter(directive => directive.name.value !== 'defer') : undefined,
    },
  ];
}

function splitInlineFragment(originalFragment: InlineFragmentNode): [InlineFragmentNode, InlineFragmentNode] {
  const [deferredSelections, undeferredSelections] = splitSelections(originalFragment.selectionSet.selections);

  const directives = originalFragment.directives;
  return [
    {
      ...originalFragment,
      selectionSet: {
        ...originalFragment.selectionSet,
        selections: deferredSelections,
      },
    },
    {
      ...originalFragment,
      selectionSet: {
        ...originalFragment.selectionSet,
        selections: undeferredSelections,
      },
      directives: directives ? directives.filter(directive => directive.name.value !== 'defer') : undefined,
    },
  ];
}

function duplicateFragmentSpread(spreadNode: FragmentSpreadNode): [FragmentSpreadNode, FragmentSpreadNode] {
  const fragmentName = spreadNode.name.value;

  const deferredSpreadNode = {
    ...spreadNode,
    name: {
      ...spreadNode.name,
      value: `__Deferred__${fragmentName}`,
    },
  };

  const undeferredSpreadNode = {
    ...spreadNode,
    name: {
      ...spreadNode.name,
      value: `__Undeferred__${fragmentName}`,
    },
    directives: spreadNode.directives
      ? spreadNode.directives.filter(directive => directive.name.value !== 'defer')
      : undefined,
  };

  return [deferredSpreadNode, undeferredSpreadNode];
}
