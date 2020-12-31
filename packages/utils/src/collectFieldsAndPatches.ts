import {
  GraphQLObjectType,
  SelectionSetNode,
  FieldNode,
  Kind,
  FragmentSpreadNode,
  InlineFragmentNode,
  getDirectiveValues,
} from 'graphql';

// fix once exported from index!
import { GraphQLDeferDirective } from 'graphql/type';

import { doesFragmentConditionMatch, getFieldEntryKey, shouldIncludeNode } from './collectFields';

import { GraphQLExecutionContext } from './Interfaces';

/**
 * Given a selectionSet, adds all of the fields in that selection to
 * the passed in map of fields, and returns it at the end.
 *
 * CollectFields requires the "runtime type" of an object. For a field which
 * returns an Interface or Union type, the "runtime type" will be the actual
 * Object type returned by that field.
 *
 * @internal
 */
export function collectFieldsAndPatches(
  exeContext: GraphQLExecutionContext,
  runtimeType: GraphQLObjectType,
  selectionSet: SelectionSetNode,
  fields: Record<string, Array<FieldNode>>,
  patches: Array<{
    label?: string;
    fields: Record<string, Array<FieldNode>>;
  }>,
  visitedFragmentNames: Record<string, boolean>
): {
  fields: Record<string, Array<FieldNode>>;
  patches: Array<{
    label?: string;
    fields: Record<string, Array<FieldNode>>;
  }>;
} {
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        if (!shouldIncludeNode(exeContext, selection)) {
          continue;
        }
        const name = getFieldEntryKey(selection);
        if (!fields[name]) {
          fields[name] = [];
        }
        fields[name].push(selection);
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        if (
          !shouldIncludeNode(exeContext, selection) ||
          !doesFragmentConditionMatch(exeContext, selection, runtimeType)
        ) {
          continue;
        }

        const defer = getDeferValues(exeContext, selection);

        if (defer) {
          const { fields: patchFields } = collectFieldsAndPatches(
            exeContext,
            runtimeType,
            selection.selectionSet,
            Object.create(null),
            patches,
            visitedFragmentNames
          );
          patches.push({
            label: defer.label,
            fields: patchFields,
          });
        } else {
          collectFieldsAndPatches(
            exeContext,
            runtimeType,
            selection.selectionSet,
            fields,
            patches,
            visitedFragmentNames
          );
        }
        break;
      }
      case Kind.FRAGMENT_SPREAD: {
        const fragName = selection.name.value;

        if (!shouldIncludeNode(exeContext, selection)) {
          continue;
        }

        const defer = getDeferValues(exeContext, selection);

        if (
          visitedFragmentNames[fragName] &&
          // Cannot continue in this case because fields must be recollected for patch
          !defer
        ) {
          continue;
        }
        visitedFragmentNames[fragName] = true;
        const fragment = exeContext.fragments[fragName];
        if (!fragment || !doesFragmentConditionMatch(exeContext, fragment, runtimeType)) {
          continue;
        }

        if (defer) {
          const { fields: patchFields } = collectFieldsAndPatches(
            exeContext,
            runtimeType,
            fragment.selectionSet,
            Object.create(null),
            patches,
            visitedFragmentNames
          );
          patches.push({
            label: defer.label,
            fields: patchFields,
          });
        } else {
          collectFieldsAndPatches(
            exeContext,
            runtimeType,
            fragment.selectionSet,
            fields,
            patches,
            visitedFragmentNames
          );
        }

        break;
      }
    }
  }
  return { fields, patches };
}

/**
 * Returns an object containing the @defer arguments if a field should be
 * deferred based on the experimental flag, defer directive present and
 * not disabled by the "if" argument.
 */
function getDeferValues(
  exeContext: GraphQLExecutionContext,
  node: FragmentSpreadNode | InlineFragmentNode
): { label?: string } {
  const defer = getDirectiveValues(GraphQLDeferDirective, node, exeContext.variableValues);

  if (!defer) {
    return;
  }

  if (defer.if === false) {
    return;
  }

  return {
    label: typeof defer.label === 'string' ? defer.label : undefined,
  };
}
