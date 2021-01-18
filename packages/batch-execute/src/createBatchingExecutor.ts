import { getOperationAST, GraphQLSchema } from 'graphql';

import DataLoader from 'dataloader';

import { AsyncExecutionResult, ExecutionResult } from '@graphql-tools/utils';

import { ExecutionParams, Executor } from './types';

import { mergeExecutionParams } from './mergeExecutionParams';
import { splitResult } from './splitResult';

export function createBatchingExecutor(
  executor: Executor,
  targetSchema: GraphQLSchema,
  dataLoaderOptions?: DataLoader.Options<any, any, any>,
  extensionsReducer?: (mergedExtensions: Record<string, any>, executionParams: ExecutionParams) => Record<string, any>
): Executor {
  const loader = new DataLoader(
    createLoadFn(executor, targetSchema, extensionsReducer ?? defaultExtensionsReducer),
    dataLoaderOptions
  );
  return (executionParams: ExecutionParams) => loader.load(executionParams);
}

function createLoadFn(
  executor: ({
    document,
    context,
    variables,
    info,
  }: ExecutionParams) =>
    | ExecutionResult
    | AsyncIterableIterator<AsyncExecutionResult>
    | Promise<ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>>,
  targetSchema: GraphQLSchema,
  extensionsReducer: (mergedExtensions: Record<string, any>, executionParams: ExecutionParams) => Record<string, any>
) {
  return async (
    executionParamSet: Array<ExecutionParams>
  ): Promise<
    Array<
      | ExecutionResult
      | AsyncIterableIterator<AsyncExecutionResult>
      | Promise<ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>>
    >
  > => {
    const batchedExecutionParamSets: Array<Array<ExecutionParams>> = [];
    let index = 0;
    const executionParams = executionParamSet[index];
    let currentBatch: Array<ExecutionParams> = [executionParams];
    batchedExecutionParamSets.push(currentBatch);
    const operationType = getOperationAST(executionParams.document, undefined).operation;
    while (++index < executionParamSet.length) {
      const currentOperationType = getOperationAST(executionParamSet[index].document, undefined).operation;
      if (operationType === currentOperationType) {
        currentBatch.push(executionParamSet[index]);
      } else {
        currentBatch = [executionParamSet[index]];
        batchedExecutionParamSets.push(currentBatch);
      }
    }

    let results: Array<
      | ExecutionResult
      | AsyncIterableIterator<ExecutionResult>
      | Promise<ExecutionResult | AsyncIterableIterator<ExecutionResult>>
    > = [];
    batchedExecutionParamSets.forEach(batchedExecutionParamSet => {
      const mergedExecutionParams = mergeExecutionParams(batchedExecutionParamSet, targetSchema, extensionsReducer);
      const executionResult = executor(mergedExecutionParams);
      results = results.concat(splitResult(executionResult, batchedExecutionParamSet.length));
    });

    return results;
  };
}

function defaultExtensionsReducer(
  mergedExtensions: Record<string, any>,
  executionParams: ExecutionParams
): Record<string, any> {
  const newExtensions = executionParams.extensions;
  if (newExtensions != null) {
    Object.assign(mergedExtensions, newExtensions);
  }
  return mergedExtensions;
}
