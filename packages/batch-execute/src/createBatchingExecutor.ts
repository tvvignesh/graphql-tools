import { getOperationAST } from 'graphql';

import isPromise from 'is-promise';

import DataLoader from 'dataloader';

import { ExecutionParams, Executor, ExecutionResult } from '@graphql-tools/utils';

import { mergeExecutionParams } from './mergeExecutionParams';
import { splitResult } from './splitResult';

export function createBatchingExecutor(
  executor: Executor,
  dataLoaderOptions?: DataLoader.Options<any, any, any>,
  extensionsReducer?: (mergedExtensions: Record<string, any>, executionParams: ExecutionParams) => Record<string, any>
): Executor {
  const loader = new DataLoader(
    createLoadFn(executor, extensionsReducer ?? defaultExtensionsReducer),
    dataLoaderOptions
  );
  return (executionParams: ExecutionParams) => loader.load(executionParams);
}

function createLoadFn(
  executor: ({ document, context, variables, info }: ExecutionParams) => ExecutionResult | Promise<ExecutionResult>,
  extensionsReducer: (mergedExtensions: Record<string, any>, executionParams: ExecutionParams) => Record<string, any>
) {
  return async (execs: Array<ExecutionParams>): Promise<Array<ExecutionResult>> => {
    const execBatches: Array<Array<ExecutionParams>> = [];
    let index = 0;
    const exec = execs[index];
    let currentBatch: Array<ExecutionParams> = [exec];
    execBatches.push(currentBatch);
    const operationType = getOperationAST(exec.document, undefined).operation;
    while (++index < execs.length) {
      const currentOperationType = getOperationAST(execs[index].document, undefined).operation;
      if (operationType === currentOperationType) {
        currentBatch.push(execs[index]);
      } else {
        currentBatch = [execs[index]];
        execBatches.push(currentBatch);
      }
    }

    let containsPromises = false;
    const executionResults: Array<ExecutionResult | Promise<ExecutionResult>> = [];
    execBatches.forEach(execBatch => {
      const mergedExecutionParams = mergeExecutionParams(execBatch, extensionsReducer);
      const executionResult = executor(mergedExecutionParams);

      if (isPromise(executionResult)) {
        containsPromises = true;
      }
      executionResults.push(executionResult);
    });

    if (containsPromises) {
      return Promise.all(executionResults).then(resultBatches => {
        let results: Array<ExecutionResult> = [];
        resultBatches.forEach((resultBatch, index) => {
          results = results.concat(splitResult(resultBatch, execBatches[index].length));
        });
        return results;
      });
    }

    let results: Array<ExecutionResult> = [];
    (executionResults as Array<ExecutionResult>).forEach((resultBatch, index) => {
      results = results.concat(splitResult(resultBatch, execBatches[index].length));
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
