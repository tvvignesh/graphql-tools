import {
  ExecutionPatchResult,
  ExecutionResult,
  GraphQLResolveInfo,
  GraphQLSchema,
  SelectionSetNode,
  responsePathAsArray,
} from 'graphql';

import { AsyncExecutionResult } from '@graphql-tools/utils';
import { InMemoryPubSub } from '@graphql-tools/pubsub';

import { DelegationContext, ExternalObject, SubschemaConfig } from './types';
import { getUnpathedErrors } from './externalObjects';
import { resolveExternalValue } from './resolveExternalValue';

export class Receiver {
  private readonly asyncIterable: AsyncIterable<AsyncExecutionResult>;
  private readonly fieldName: string;
  private readonly subschema: GraphQLSchema | SubschemaConfig;
  private readonly context: Record<string, any>;
  private readonly deferredSelectionSets: Record<string, SelectionSetNode>;
  private readonly resultTransformer: (originalResult: ExecutionResult) => any;
  private readonly initialResultDepth: number;
  private readonly pubsub: InMemoryPubSub<ExternalObject>;
  private patches: Record<string, Array<any>>;
  private iterating: boolean;
  private numRequests: number;

  constructor(
    asyncIterable: AsyncIterable<AsyncExecutionResult>,
    delegationContext: DelegationContext,
    resultTransformer: (originalResult: ExecutionResult) => any
  ) {
    this.asyncIterable = asyncIterable;

    const { fieldName, subschema, context, info, deferredSelectionSets } = delegationContext;

    this.fieldName = fieldName;
    this.subschema = subschema;
    this.context = context;
    this.deferredSelectionSets = deferredSelectionSets;

    this.resultTransformer = resultTransformer;
    this.initialResultDepth = info ? responsePathAsArray(info.path).length - 1 : 0;
    this.patches = Object.create(null);
    this.pubsub = new InMemoryPubSub();

    this.iterating = false;
    this.numRequests = 0;
  }

  public async getInitialResult() {
    const asyncIterator = this.asyncIterable[Symbol.asyncIterator]();
    const payload = await asyncIterator.next();
    const transformedResult = this.resultTransformer(payload.value);
    return transformedResult;
  }

  public async request(info: GraphQLResolveInfo): Promise<any> {
    // Problem!
    //
    // @defer allows multiple patches at the same path with different sets of fields
    //
    // let's say we have a query like this:
    //
    // query {
    //   object {
    //     ... on Object @defer {
    //       field {
    //         subfield1
    //       }
    //     }
    //     ... on Object @defer {
    //       field {
    //         subfield2
    //       }
    //     }
    //   }
    // }
    //
    // defaultMergeResolver will...
    //
    // (1) resolve 'object' as an empty ExternalObject value with a receiver
    // (2) resolve 'field' by calling 'receiver.request(...)' for field which will
    //     be fulfilled with whichever patch comes back first, let's say the first
    //     'field' patch containing 'subfield1'
    // (3) resolve 'subfield1' by its presence within that patch
    // (4) resolve 'subfield2' by calling 'receiver.request(...)' for subfield2
    //
    // With (4) being tricky! 'subfield2' is not the path that was returned by the patch,
    // ('object'), nor a subfield of that path ('field'), it's a field that could
    // theoretically be anywhere in the tree (because the problem could be even more nested).
    //
    // So that means you can't just subscribe to the path you want, you have to subscribe to
    // every parent of that path, and also check if the descendant is within that patch.
    //
    // But then the problem is that `resolveExternalValue` was not called level by level
    // for these 'orphaned patches' and so you will have to do that as well, which
    // requires knowing the type of every field in the execution tree.
    //
    // Taking a step back, the problem is that defer does not just defer -- it creates
    // a new branch of execution. We have no way (yet?) within our schema of mapping
    // the current branch of execution to the returning proxied branch of execution
    // and so are trying to elide that requirement by just merging together the different
    // proxied results as they come in.
    //
    // =======
    // An idea
    // =======
    //
    // Perhaps we could modify the above as follows:
    // (1) resolve 'object' as an empty ExternalObject value with a receiver
    // (2) resolve 'field' by calling 'receiver.request(...)' for field which will
    //     be fulfilled with whichever patch comes back first, let's say the first
    //     'field' patch containing 'subfield1', store the fact that 'object.field'
    //     was already resolved using `resolveExternalValue`.
    // (3) resolve 'subfield1' EVEN THOUGH IT IS WITHIN THAT PATCH by calling
    //     'receiver.request' for subfield1, so that we can store the fact that
    //     field.subfield1 has been resolved using 'resolveExternalValue'
    // (4) resolve 'subfield2' by calling 'receiver.request(...)' for subfield2,
    //     which is really the only option, because it is not within that patch.
    // (5) meanwhile, 'receiver._iterate()' can access the store and note that subsequent
    //     patches for 'field', etc, should automatically be resolved using `resolveExternalValue`
    //     with the same parameters as the first call, with the values for the subfields
    //     published out instead of the fields
    //
    // ==========
    // What if...
    // ==========
    //
    // ...the field type is a list of SubType objects and not a single SubType object?
    //
    // It seemms that we just need to modify (5) to recursively go through the list or list
    // of lists and publish out each individual object.

    const pathArray = responsePathAsArray(info.path).slice(this.initialResultDepth);
    const responseKey = pathArray.pop() as string;
    const pathKey = pathArray.join('.');

    const patches = this.patches[pathKey];
    if (patches !== undefined) {
      for (const patch of patches) {
        const data = patch[responseKey];
        if (data !== undefined) {
          const unpathedErrors = getUnpathedErrors(patch);
          return resolveExternalValue(data, unpathedErrors, this.subschema, this.context, info, this);
        }
      }
    }

    const asyncIterable = this.pubsub.subscribe(pathKey);

    this.numRequests++;
    if (!this.iterating) {
      this._iterate();
    }

    return this._reduce(asyncIterable, responseKey, info);
  }

  private async _reduce(
    asyncIterable: AsyncIterableIterator<ExternalObject>,
    responseKey: string,
    info: GraphQLResolveInfo
  ): Promise<any> {
    for await (const parent of asyncIterable) {
      const data = parent[responseKey];
      if (data !== undefined) {
        const unpathedErrors = getUnpathedErrors(parent);
        return resolveExternalValue(data, unpathedErrors, this.subschema, this.context, info, this);
      }
    }
  }

  private async _iterate(): Promise<void> {
    const iterator = this.asyncIterable[Symbol.asyncIterator]();

    let hasNext = true;
    while (hasNext && this.numRequests) {
      const payload = (await iterator.next()) as IteratorResult<ExecutionPatchResult, ExecutionPatchResult>;

      hasNext = !payload.done;
      const asyncResult = payload.value;

      if (asyncResult != null && asyncResult.path?.[0] === this.fieldName) {
        const transformedResult = this.resultTransformer(asyncResult);
        const pathKey = asyncResult.path.join('.');
        this.pubsub.publish(pathKey, transformedResult);
        const patches = this.patches[pathKey];
        if (patches == null) {
          this.patches[pathKey] = transformedResult;
        } else {
          // TODO:
          //
          // AS NEXT PLANNED STEP:
          //
          // Now that we have the stored deferredSelectionSets,
          // instead of keeping an array of patches received at a particular pathKey,
          // we can keep a single object with the merged result at that path
          // using mergeExternalObjects
          //
          // one wrinkle is that the stored deferredSeletionSet is not (yet?) filtered,
          // and may contain fields that are not within the delegated schema. It remains
          // to be seen whether these "extra" fields need to be explicitly filtered from
          // the result, which is somewhat repetitive/cumbersome to actually do. Hopefully
          // it will not be acutally required.
          //
          this.patches[pathKey].push(transformedResult);
        }
      }
    }
  }
}
