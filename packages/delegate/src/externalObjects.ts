import { GraphQLSchema, GraphQLError, GraphQLObjectType, SelectionSetNode } from 'graphql';

import { relocatedError, GraphQLExecutionContext, collectFields } from '@graphql-tools/utils';

import { SubschemaConfig, ExternalObject } from './types';
import {
  OBJECT_SUBSCHEMA_SYMBOL,
  FIELD_SUBSCHEMA_MAP_SYMBOL,
  UNPATHED_ERRORS_SYMBOL,
  RECEIVER_MAP_SYMBOL,
} from './symbols';
import { Receiver } from './Receiver';

export function isExternalObject(data: any): data is ExternalObject {
  return data[UNPATHED_ERRORS_SYMBOL] !== undefined;
}

export function annotateExternalObject(
  object: any,
  errors: Array<GraphQLError>,
  subschema: GraphQLSchema | SubschemaConfig,
  receiver: Receiver
): ExternalObject {
  const receiverMap: Map<GraphQLSchema | SubschemaConfig, Receiver> = new Map();
  receiverMap.set(subschema, receiver);
  Object.defineProperties(object, {
    [OBJECT_SUBSCHEMA_SYMBOL]: { value: subschema },
    [FIELD_SUBSCHEMA_MAP_SYMBOL]: { value: Object.create(null) },
    [UNPATHED_ERRORS_SYMBOL]: { value: errors },
    [RECEIVER_MAP_SYMBOL]: { value: receiverMap },
  });
  return object;
}

export function getSubschema(object: ExternalObject, responseKey: string): GraphQLSchema | SubschemaConfig {
  return object[FIELD_SUBSCHEMA_MAP_SYMBOL][responseKey] ?? object[OBJECT_SUBSCHEMA_SYMBOL];
}

export function getUnpathedErrors(object: ExternalObject): Array<GraphQLError> {
  return object[UNPATHED_ERRORS_SYMBOL];
}

export function getReceiver(object: ExternalObject, subschema: GraphQLSchema | SubschemaConfig): Receiver {
  return object[RECEIVER_MAP_SYMBOL].get(subschema);
}

export function mergeExternalObjects(
  schema: GraphQLSchema,
  path: Array<string | number>,
  typeName: string,
  target: ExternalObject,
  sources: Array<ExternalObject>,
  selectionSets: Array<SelectionSetNode>
): ExternalObject {
  if (target[FIELD_SUBSCHEMA_MAP_SYMBOL] == null) {
    target[FIELD_SUBSCHEMA_MAP_SYMBOL] = Object.create(null);
  }

  const newFieldSubschemaMap = target[FIELD_SUBSCHEMA_MAP_SYMBOL];
  const newReceiverMap = target[RECEIVER_MAP_SYMBOL];
  const newUnpathedErrors = target[UNPATHED_ERRORS_SYMBOL];

  sources.forEach((source, index) => {
    const fieldNodes = collectFields(
      {
        schema,
        variableValues: {},
        fragments: {},
      } as GraphQLExecutionContext,
      schema.getType(typeName) as GraphQLObjectType,
      selectionSets[index],
      Object.create(null),
      Object.create(null)
    );

    if (source instanceof GraphQLError || source === null) {
      Object.keys(fieldNodes).forEach(responseKey => {
        target[responseKey] =
          source instanceof GraphQLError ? relocatedError(source, path.concat([responseKey])) : null;
      });
      return;
    }

    const objectSubschema = source[OBJECT_SUBSCHEMA_SYMBOL];
    Object.keys(fieldNodes).forEach(responseKey => {
      target[responseKey] = source[responseKey];
      newFieldSubschemaMap[responseKey] = objectSubschema;
    });

    if (isExternalObject(source)) {
      const receiverMap = source[RECEIVER_MAP_SYMBOL];
      receiverMap.forEach((receiver, subschema) => {
        newReceiverMap.set(subschema, receiver);
      });

      newUnpathedErrors.push(...source[UNPATHED_ERRORS_SYMBOL]);

      const fieldSubschemaMap = source[FIELD_SUBSCHEMA_MAP_SYMBOL];
      Object.keys(fieldSubschemaMap).forEach(responseKey => {
        newFieldSubschemaMap[responseKey] = fieldSubschemaMap[responseKey];
      });
    }
  });

  return target;
}
