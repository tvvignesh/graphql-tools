import { GraphQLSchema, FieldNode, GraphQLObjectType, GraphQLResolveInfo } from 'graphql';

import { collectFields, collectFieldsAndPatches, GraphQLExecutionContext } from '@graphql-tools/utils';

import { isSubschemaConfig } from './subschemaConfig';
import { MergedTypeInfo, SubschemaConfig, StitchingInfo } from './types';
import { memoizeInfoAnd2Objects } from './memoize';

function collectSubFields(
  info: GraphQLResolveInfo,
  typeName: string
): {
  fieldNodes: Record<string, Array<FieldNode>>;
  patches: Array<{ fields: Record<string, Array<FieldNode>> }>;
} {
  const subFieldNodes: Record<string, Array<FieldNode>> = Object.create(null);
  const patches: Array<{ label?: string; fields: Record<string, Array<FieldNode>> }> = [];
  const visitedFragmentNames = Object.create(null);

  const type = info.schema.getType(typeName) as GraphQLObjectType;
  const partialExecutionContext = ({
    schema: info.schema,
    variableValues: info.variableValues,
    fragments: info.fragments,
  } as unknown) as GraphQLExecutionContext;

  info.fieldNodes.forEach(fieldNode => {
    collectFieldsAndPatches(
      partialExecutionContext,
      type,
      fieldNode.selectionSet,
      subFieldNodes,
      patches,
      visitedFragmentNames
    );
  });

  const stitchingInfo = info.schema.extensions.stitchingInfo as StitchingInfo;
  const selectionSetsByField = stitchingInfo.selectionSetsByField;

  Object.keys(subFieldNodes).forEach(responseName => {
    const fieldName = subFieldNodes[responseName][0].name.value;
    const fieldSelectionSet = selectionSetsByField?.[typeName]?.[fieldName];
    if (fieldSelectionSet != null) {
      collectFields(partialExecutionContext, type, fieldSelectionSet, subFieldNodes, visitedFragmentNames);
    }
  });

  return { fieldNodes: subFieldNodes, patches };
}

export const getFieldsNotInSubschema = memoizeInfoAnd2Objects(function (
  info: GraphQLResolveInfo,
  subschema: GraphQLSchema | SubschemaConfig,
  mergedTypeInfo: MergedTypeInfo
): { fields: Array<FieldNode>; patches: Array<Array<FieldNode>> } {
  const typeMap = isSubschemaConfig(subschema) ? mergedTypeInfo.typeMaps.get(subschema) : subschema.getTypeMap();
  const typeName = mergedTypeInfo.typeName;
  const fields = (typeMap[typeName] as GraphQLObjectType).getFields();

  const { fieldNodes: subFieldNodes, patches } = collectSubFields(info, typeName);

  let fieldsNotInSchema: Array<FieldNode> = [];
  Object.keys(subFieldNodes).forEach(responseName => {
    const fieldName = subFieldNodes[responseName][0].name.value;
    if (!(fieldName in fields)) {
      fieldsNotInSchema = fieldsNotInSchema.concat(subFieldNodes[responseName]);
    }
  });

  const newPatches: Array<Array<FieldNode>> = [];
  patches.forEach(patch => {
    let patchFieldsNotInSchema: Array<FieldNode> = [];
    const patchFields = patch.fields;
    Object.keys(patchFields).forEach(responseName => {
      const fieldName = patchFields[responseName][0].name.value;
      if (!(fieldName in fields)) {
        patchFieldsNotInSchema = patchFieldsNotInSchema.concat(patchFields[responseName]);
      }
    });
    newPatches.push(patchFieldsNotInSchema);
  });

  return { fields: fieldsNotInSchema, patches: newPatches };
});
