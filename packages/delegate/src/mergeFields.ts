import {
  FieldNode,
  Kind,
  GraphQLResolveInfo,
  SelectionSetNode,
  GraphQLObjectType,
  responsePathAsArray,
  getNamedType,
  InlineFragmentNode,
} from 'graphql';

import isPromise from 'is-promise';

import { MergedTypeInfo } from './types';
import { memoize4, memoize3, memoize2 } from './memoize';
import { mergeExternalObjects } from './externalObjects';
import { Subschema } from './Subschema';

const sortSubschemasByProxiability = memoize4(function (
  mergedTypeInfo: MergedTypeInfo,
  sourceSubschemaOrSourceSubschemas: Subschema | Array<Subschema>,
  targetSubschemas: Array<Subschema>,
  fieldsAndPatches: {
    fields: Array<FieldNode>;
    patches: Array<Array<FieldNode>>;
  }
): {
  proxiableSubschemas: Array<Subschema>;
  nonProxiableSubschemas: Array<Subschema>;
} {
  // 1.  calculate if possible to delegate to given subschema

  const proxiableSubschemas: Array<Subschema> = [];
  const nonProxiableSubschemas: Array<Subschema> = [];

  targetSubschemas.forEach(t => {
    const selectionSet = mergedTypeInfo.selectionSets.get(t);
    const fieldSelectionSets = mergedTypeInfo.fieldSelectionSets.get(t);
    if (
      selectionSet != null &&
      !subschemaTypesContainSelectionSet(mergedTypeInfo, sourceSubschemaOrSourceSubschemas, selectionSet)
    ) {
      nonProxiableSubschemas.push(t);
    } else {
      if (
        fieldSelectionSets == null ||
        hasAllFieldSelectionSets(
          mergedTypeInfo,
          sourceSubschemaOrSourceSubschemas,
          fieldsAndPatches,
          fieldSelectionSets
        )
      ) {
        proxiableSubschemas.push(t);
      } else {
        nonProxiableSubschemas.push(t);
      }
    }
  });

  return {
    proxiableSubschemas,
    nonProxiableSubschemas,
  };
});

function hasAllFieldSelectionSetsForFieldNodes(
  mergedTypeInfo: MergedTypeInfo,
  sourceSubschemaOrSourceSubschemas: Subschema | Array<Subschema>,
  fieldNodes: Array<FieldNode>,
  fieldSelectionSets: Record<string, SelectionSetNode>
): boolean {
  return fieldNodes.every(fieldNode => {
    const fieldName = fieldNode.name.value;
    const fieldSelectionSet = fieldSelectionSets[fieldName];
    return (
      fieldSelectionSet == null ||
      subschemaTypesContainSelectionSet(mergedTypeInfo, sourceSubschemaOrSourceSubschemas, fieldSelectionSet)
    );
  });
}

function hasAllFieldSelectionSets(
  mergedTypeInfo: MergedTypeInfo,
  sourceSubschemaOrSourceSubschemas: Subschema | Array<Subschema>,
  fieldsAndPatches: {
    fields: Array<FieldNode>;
    patches: Array<Array<FieldNode>>;
  },
  fieldSelectionSets: Record<string, SelectionSetNode>
): boolean {
  const { fields, patches } = fieldsAndPatches;

  if (
    !hasAllFieldSelectionSetsForFieldNodes(
      mergedTypeInfo,
      sourceSubschemaOrSourceSubschemas,
      fields,
      fieldSelectionSets
    )
  ) {
    return false;
  }

  for (const patch of patches) {
    if (
      !hasAllFieldSelectionSetsForFieldNodes(
        mergedTypeInfo,
        sourceSubschemaOrSourceSubschemas,
        patch,
        fieldSelectionSets
      )
    ) {
      return false;
    }
  }

  return true;
}

const buildDelegationPlan = memoize3(function (
  mergedTypeInfo: MergedTypeInfo,
  fieldsAndPatches: {
    fields: Array<FieldNode>;
    patches: Array<Array<FieldNode>>;
  },
  proxiableSubschemas: Array<Subschema>
): {
  delegationMap: Map<Subschema, SelectionSetNode>;
  unproxiableFieldsAndPatches: {
    fields: Array<FieldNode>;
    patches: Array<Array<FieldNode>>;
  };
} {
  const { fields, patches } = fieldsAndPatches;
  const { uniqueFields, nonUniqueFields } = mergedTypeInfo;

  // 2. for each of fields and patches:

  const { delegationMap, unproxiableFields } = buildDelegationMap(
    fields,
    proxiableSubschemas,
    uniqueFields,
    nonUniqueFields
  );

  const planChunks: Array<{
    delegationMap: Map<Subschema, Array<FieldNode>>;
    unproxiableFields: Array<FieldNode>;
  }> = [];

  patches.forEach(patchFields => {
    planChunks.push(buildDelegationMap(patchFields, proxiableSubschemas, uniqueFields, nonUniqueFields));
  });

  const finalDelegationMap: Map<Subschema, SelectionSetNode> = new Map();

  delegationMap.forEach((fields, subschema) => {
    finalDelegationMap.set(subschema, {
      kind: Kind.SELECTION_SET,
      selections: fields,
    });
  });

  const unproxiablePatchFields: Array<Array<FieldNode>> = [];

  planChunks.forEach(planChunk => {
    const { delegationMap: patchDelegationMap, unproxiableFields: patchUnproxiableFields } = planChunk;

    patchDelegationMap.forEach((patchFields, subschema) => {
      const existingSelectionSet = finalDelegationMap.get(subschema);
      {
        const patchFragment: InlineFragmentNode = {
          kind: Kind.INLINE_FRAGMENT,
          typeCondition: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: mergedTypeInfo.typeName,
            },
          },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: patchFields,
          },
          directives: [
            {
              kind: Kind.DIRECTIVE,
              name: {
                kind: Kind.NAME,
                value: 'defer',
              },
            },
          ],
        };

        if (existingSelectionSet == null) {
          finalDelegationMap.set(subschema, {
            kind: Kind.SELECTION_SET,
            selections: [patchFragment],
          });
        } else {
          existingSelectionSet.selections = existingSelectionSet.selections.concat(patchFragment);
        }

        unproxiablePatchFields.push(patchUnproxiableFields);
      }
    });
  });

  return {
    delegationMap: finalDelegationMap,
    unproxiableFieldsAndPatches: {
      fields: unproxiableFields,
      patches: unproxiablePatchFields,
    },
  };
});

function buildDelegationMap(
  fields: Array<FieldNode>,
  proxiableSubschemas: Array<Subschema>,
  uniqueFields: Record<string, Subschema>,
  nonUniqueFields: Record<string, Array<Subschema>>
): { delegationMap: Map<Subschema, Array<FieldNode>>; unproxiableFields: Array<FieldNode> } {
  const delegationMap: Map<Subschema, Array<FieldNode>> = new Map();
  const unproxiableFields: Array<FieldNode> = [];

  fields.forEach(fieldNode => {
    if (fieldNode.name.value === '__typename') {
      return;
    }

    // 2a. use uniqueFields map to assign fields to subschema if one of possible subschemas

    const uniqueSubschema: Subschema = uniqueFields[fieldNode.name.value];
    if (uniqueSubschema != null) {
      if (!proxiableSubschemas.includes(uniqueSubschema)) {
        unproxiableFields.push(fieldNode);
        return;
      }

      const existingSubschema = delegationMap.get(uniqueSubschema);
      if (existingSubschema != null) {
        existingSubschema.push(fieldNode);
      } else {
        delegationMap.set(uniqueSubschema, [fieldNode]);
      }

      return;
    }

    // 2b. use nonUniqueFields to assign to a possible subschema,
    //     preferring one of the subschemas already targets of delegation

    let nonUniqueSubschemas: Array<Subschema> = nonUniqueFields[fieldNode.name.value];
    if (nonUniqueSubschemas == null) {
      unproxiableFields.push(fieldNode);
      return;
    }

    nonUniqueSubschemas = nonUniqueSubschemas.filter(s => proxiableSubschemas.includes(s));
    if (!nonUniqueSubschemas.length) {
      unproxiableFields.push(fieldNode);
      return;
    }

    const existingSubschema = nonUniqueSubschemas.find(s => delegationMap.has(s));
    if (existingSubschema != null) {
      delegationMap.get(existingSubschema).push(fieldNode);
    } else {
      delegationMap.set(nonUniqueSubschemas[0], [fieldNode]);
    }
  });

  return {
    delegationMap,
    unproxiableFields,
  };
}

const combineSubschemas = memoize2(function (
  subschemaOrSubschemas: Subschema | Array<Subschema>,
  additionalSubschemas: Array<Subschema>
): Array<Subschema> {
  return Array.isArray(subschemaOrSubschemas)
    ? subschemaOrSubschemas.concat(additionalSubschemas)
    : [subschemaOrSubschemas].concat(additionalSubschemas);
});

export function mergeFields(
  mergedTypeInfo: MergedTypeInfo,
  typeName: string,
  object: any,
  fieldsAndPatches: {
    fields: Array<FieldNode>;
    patches: Array<Array<FieldNode>>;
  },
  sourceSubschemaOrSourceSubschemas: Subschema | Array<Subschema>,
  targetSubschemas: Array<Subschema>,
  context: Record<string, any>,
  info: GraphQLResolveInfo
): any {
  const { fields, patches } = fieldsAndPatches;

  if (!fields.length && patches.every(patch => !patch.length)) {
    return object;
  }

  const { proxiableSubschemas, nonProxiableSubschemas } = sortSubschemasByProxiability(
    mergedTypeInfo,
    sourceSubschemaOrSourceSubschemas,
    targetSubschemas,
    fieldsAndPatches
  );

  const { delegationMap, unproxiableFieldsAndPatches } = buildDelegationPlan(
    mergedTypeInfo,
    fieldsAndPatches,
    proxiableSubschemas
  );

  if (!delegationMap.size) {
    return object;
  }

  let containsPromises = false;
  const resultMap: Map<Promise<any> | any, SelectionSetNode> = new Map();
  delegationMap.forEach((selectionSet: SelectionSetNode, s: Subschema) => {
    const resolver = mergedTypeInfo.resolvers.get(s);
    let maybePromise = resolver(object, context, info, s, selectionSet);
    if (isPromise(maybePromise)) {
      containsPromises = true;
      maybePromise = maybePromise.then(undefined, error => error);
    }
    resultMap.set(maybePromise, selectionSet);
  });

  return containsPromises
    ? Promise.all(resultMap.keys()).then(results =>
        mergeFields(
          mergedTypeInfo,
          typeName,
          mergeExternalObjects(
            info.schema,
            responsePathAsArray(info.path),
            object.__typename,
            object,
            results,
            Array.from(resultMap.values())
          ),
          unproxiableFieldsAndPatches,
          combineSubschemas(sourceSubschemaOrSourceSubschemas, proxiableSubschemas),
          nonProxiableSubschemas,
          context,
          info
        )
      )
    : mergeFields(
        mergedTypeInfo,
        typeName,
        mergeExternalObjects(
          info.schema,
          responsePathAsArray(info.path),
          object.__typename,
          object,
          Array.from(resultMap.keys()),
          Array.from(resultMap.values())
        ),
        unproxiableFieldsAndPatches,
        combineSubschemas(sourceSubschemaOrSourceSubschemas, proxiableSubschemas),
        nonProxiableSubschemas,
        context,
        info
      );
}

const subschemaTypesContainSelectionSet = memoize3(function (
  mergedTypeInfo: MergedTypeInfo,
  sourceSubschemaOrSourceSubschemas: Subschema | Array<Subschema>,
  selectionSet: SelectionSetNode
) {
  if (Array.isArray(sourceSubschemaOrSourceSubschemas)) {
    return typesContainSelectionSet(
      sourceSubschemaOrSourceSubschemas.map(
        sourceSubschema => sourceSubschema.transformedSchema.getType(mergedTypeInfo.typeName) as GraphQLObjectType
      ),
      selectionSet
    );
  }

  return typesContainSelectionSet(
    [sourceSubschemaOrSourceSubschemas.transformedSchema.getType(mergedTypeInfo.typeName) as GraphQLObjectType],
    selectionSet
  );
});

function typesContainSelectionSet(types: Array<GraphQLObjectType>, selectionSet: SelectionSetNode): boolean {
  const fieldMaps = types.map(type => type.getFields());

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fields = fieldMaps.map(fieldMap => fieldMap[selection.name.value]).filter(field => field != null);
      if (!fields.length) {
        return false;
      }

      if (selection.selectionSet != null) {
        return typesContainSelectionSet(
          fields.map(field => getNamedType(field.type)) as Array<GraphQLObjectType>,
          selection.selectionSet
        );
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT && selection.typeCondition.name.value === types[0].name) {
      return typesContainSelectionSet(types, selection.selectionSet);
    }
  }

  return true;
}
