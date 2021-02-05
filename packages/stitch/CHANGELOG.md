# @graphql-tools/stitch

## 7.3.0

### Minor Changes

- 1a8e1dfe: Deprecates the `MergeTypeConfig.computedFields` setting (with backwards-compatible warning) in favor of new computed field configuration written as:

  ```js
  merge: {
    MyType: {
      fields: {
        myComputedField: {
          selectionSet: '{ weight }',
          computed: true,
        }
      }
    }
  }
  ```

  A field-level `selectionSet` specifies field dependencies while the `computed` setting structures the field in a way that assures it is always selected with this data provided. The `selectionSet` is intentionally generic to support possible future uses. This new pattern organizes all field-level configuration (including `canonical`) into a single structure.

### Patch Changes

- Updated dependencies [1a8e1dfe]
  - @graphql-tools/delegate@7.0.10

## 7.2.1

### Patch Changes

- 3cf9104c: fix(stitch) canonical via transformed subschema

## 7.2.0

### Minor Changes

- d9b82a2e: enhance(stitch) canonical merged type and field definitions. Use the @canonical directive to promote preferred type and field descriptions into the combined gateway schema.

### Patch Changes

- d9b82a2e: fix(merge/stitch) consistent enum value merge
- Updated dependencies [d9b82a2e]
- Updated dependencies [d9b82a2e]
- Updated dependencies [d9b82a2e]
  - @graphql-tools/merge@6.2.7
  - @graphql-tools/delegate@7.0.9

## 7.1.9

### Patch Changes

- 6a966bee: fix(stitch): add \_\_typename for mutations

  fix related to #2349

## 7.1.8

### Patch Changes

- 6e50d9fc: enhance(stitching-directives): use keyField

  When using simple keys, i.e. when using the keyField argument to `@merge`, the keyField can be added implicitly to the types's key. In most cases, therefore, `@key` should not be required at all.

- Updated dependencies [6e50d9fc]
  - @graphql-tools/utils@7.2.4

## 7.1.7

### Patch Changes

- 06a6acbe: fix(stitch): computed fields should work with merge resolvers that return abstract types

  see: https://github.com/ardatan/graphql-tools/pull/2432#issuecomment-753729191
  and: https://github.com/gmac/schema-stitching-handbook/pull/17

## 7.1.6

### Patch Changes

- c84d2f8f: fix(stitch): always use defaultMergedResolver by default on gateway

## 7.1.5

### Patch Changes

- cd5da458: fix(stitch): type merging for nested root types

  Because root types do not usually require selectionSets, a nested root type proxied to a remote service may end up having an empty selectionSet, if the nested root types only includes fields from a different subservice.

  Empty selection sets return null, but, in this case, it should return an empty object. We can force this behavior by including the \_\_typename field which exists on every schema.

  Addresses #2347.

  In the future, we may want to include short-circuiting behavior that when delegating to composite fields, if an empty selection set is included, an empty object is returned rather than null. This short-circuiting behavior would be complex for lists, as it would be unclear the length of the list...

- Updated dependencies [cd5da458]
- Updated dependencies [cd5da458]
- Updated dependencies [cd5da458]
  - @graphql-tools/delegate@7.0.8
  - @graphql-tools/utils@7.1.6

## 7.1.4

### Patch Changes

- 21da6904: fix release
- Updated dependencies [21da6904]
  - @graphql-tools/wrap@7.0.3
  - @graphql-tools/schema@7.1.2
  - @graphql-tools/utils@7.1.2

## 7.1.3

### Patch Changes

- b48a91b1: add ability to specify merge config within subschemas using directives
- Updated dependencies [b48a91b1]
  - @graphql-tools/schema@7.1.1
  - @graphql-tools/utils@7.1.1

## 7.1.2

### Patch Changes

- 8db8f8dd: fix(typeMerging): support transformed type names when merging types

## 7.1.1

### Patch Changes

- 878c36b6: enhance(stitch): use mergeScalar from merge
- 9c6a4409: enhance(stitch): avoid multiple iterations
- Updated dependencies [878c36b6]
- Updated dependencies [d40c0a84]
  - @graphql-tools/merge@6.2.6
  - @graphql-tools/delegate@7.0.6

## 7.1.0

### Minor Changes

- 4f5a4efe: enhance(schema): add some options to improve schema creation performance

### Patch Changes

- Updated dependencies [65ed780a]
- Updated dependencies [4f5a4efe]
- Updated dependencies [b79e3a6b]
  - @graphql-tools/schema@7.1.0
  - @graphql-tools/utils@7.1.0

## 7.0.4

### Patch Changes

- e50f80a3: enhance(stitch): custom merge resolvers
- Updated dependencies [e50f80a3]
  - @graphql-tools/delegate@7.0.5

## 7.0.3

### Patch Changes

- 718eda30: fix(stitch): fix mergeExternalObject regressions

  v7 introduced a regression in the merging of ExternalObjects that causes type merging to fail when undergoing multiple rounds of merging.

- Updated dependencies [718eda30]
  - @graphql-tools/delegate@7.0.2

## 7.0.2

### Patch Changes

- fcbc497b: fix(stitch): support type merging with abstract types (#2137)

## 7.0.1

### Patch Changes

- Updated dependencies [a9254491]
  - @graphql-tools/batch-delegate@7.0.0

## 7.0.0

### Major Changes

- be1a1575: ## Breaking Changes:

  #### Schema Generation and Decoration API (`@graphql-tools/schema`)

  - Resolver validation options should now be set to `error`, `warn` or `ignore` rather than `true` or `false`. In previous versions, some of the validators caused errors to be thrown, while some issued warnings. This changes brings consistency to validator behavior.

  - The `allowResolversNotInSchema` has been renamed to `requireResolversToMatchSchema`, to harmonize the naming convention of all the validators. The default setting of `requireResolversToMatchSchema` is `error`, matching the previous behavior.

  #### Schema Delegation (`delegateToSchema` & `@graphql-tools/delegate`)

  - The `delegateToSchema` return value has matured and been formalized as an `ExternalObject`, in which all errors are integrated into the GraphQL response, preserving their initial path. Those advanced users accessing the result directly will note the change in error handling. This also allows for the deprecation of unnecessary helper functions including `slicedError`, `getErrors`, `getErrorsByPathSegment` functions. Only external errors with missing or invalid paths must still be preserved by annotating the remote object with special properties. The new `getUnpathedErrors` function is therefore necessary for retrieving only these errors. Note also the new `annotateExternalObject` and `mergeExternalObjects` functions, as well as the renaming of `handleResult` to `resolveExternalValue`.

  - Transform types and the `applySchemaTransforms` are now relocated to the `delegate` package; `applyRequestTransforms`/`applyResultTransforms` functions have been deprecated, however, as this functionality has been replaced since v6 by the `Transformer` abstraction.

  - The `transformRequest`/`transformResult` methods are now provided additional `delegationContext` and `transformationContext` arguments -- these were introduced in v6, but previously optional.

  - The `transformSchema` method may wish to create additional delegating resolvers and so it is now provided the `subschemaConfig` and final (non-executable) `transformedSchema` parameters. As in v6, the `transformSchema` is kicked off once to produce the non-executable version, and then, if a wrapping schema is being generated, proxying resolvers are created with access to the (non-executabel) initial result. In v7, the individual `transformSchema` methods also get access to the result of the first run, if necessary, they can create additional wrapping schema proxying resolvers.

  - `applySchemaTransforms` parameters have been updated to match and support the `transformSchema` parameters above.

  #### Remote Schemas & Wrapping (`wrapSchema`, `makeRemoteExecutableSchema`, and `@graphql-tools/wrap`)

  - `wrapSchema` and `generateProxyingResolvers` now only take a single options argument with named properties of type `SubschemaConfig`. The previously possible shorthand version with first argument consisting of a `GraphQLSchema` and second argument representing the transforms should be reworked as a `SubschemaConfig` object.

  - Similarly, the `ICreateProxyingResolverOptions` interface that provides the options for the `createProxyingResolver` property of `SubschemaConfig` options has been adjusted. The `schema` property previously could be set to a `GraphQLSchema` or a `SubschemaConfig` object. This property has been removed in favor of a `subschemaConfig` property that will always be a `SubschemaConfig` object. The `transforms` property has been removed; transforms should be included within the `SubschemaConfig` object.`

  - The format of the wrapping schema has solidified. All non-root fields are expected to use identical resolvers, either `defaultMergedResolver` or a custom equivalent, with root fields doing the hard work of proxying. Support for custom merged resolvers throught `createMergedResolver` has been deprecated, as custom merging resolvers conflicts when using stitching's type merging, where resolvers are expected to be identical across subschemas.

  - The `WrapFields` transform's `wrappingResolver` option has been removed, as this complicates multiple wrapping layers, as well as planned functionality to wrap subscription root fields in potentially multiple layers, as the wrapping resolvers may be different in different layers. Modifying resolvers can still be performed by use of an additional transform such as `TransformRootFields` or `TransformObjectFields`.

  - The `ExtendSchema` transform has been removed, as it is conceptually simpler just to use `stitchSchemas` with one subschema.

  - The `ReplaceFieldsWithFragment`, `AddFragmentsByField`, `AddSelectionSetsByField`, and `AddMergedTypeSelectionSets` transforms has been removed, as they are superseded by the `AddSelectionSets` and `VisitSelectionSets` transforms. The `AddSelectionSets` purposely takes parsed SDL rather than strings, to nudge end users to parse these strings at build time (when possible), rather than at runtime. Parsing of selection set strings can be performed using the `parseSelectionSet` function from `@graphql-tools/utils`.

  #### Schema Stitching (`stitchSchemas` & `@graphql-tools/stitch`)

  - `stitchSchemas`'s `mergeTypes` option is now true by default! This causes the `onTypeConflict` option to be ignored by default. To use `onTypeConflict` to select a specific type instead of simply merging, simply set `mergeTypes` to false.

  - `schemas` argument has been deprecated, use `subschemas`, `typeDefs`, or `types`, depending on what you are stitching.

  - When using batch delegation in type merging, the `argsFromKeys` function is now set only via the `argsFromKeys` property. Previously, if `argsFromKeys` was absent, it could be read from `args`.

  - Support for fragment hints has been removed in favor of selection set hints.

  - `stitchSchemas` now processes all `GraphQLSchema` and `SubschemaConfig` subschema input into new `Subschema` objects, handling schema config directives such aso`@computed` as well as generating the final transformed schema, stored as the `transformedSchema` property, if transforms are used. Signatures of the `onTypeConflict`, `fieldConfigMerger`, and `inputFieldConfigMerger` have been updated to include metadata related to the original and transformed subschemas. Note the property name change for `onTypeConflict` from `schema` to `subschema`.

  #### Mocking (`addMocksToSchema` and `@graphql-tools/mock`)

  - Mocks returning objects with fields set as functions are now operating according to upstream graphql-js convention, i.e. these functions take three arguments, `args`, `context`, and `info` with `parent` available as `this` rather than as the first argument.

  #### Other Utilities (`@graphql-tools/utils`)

  - `filterSchema`'s `fieldFilter` will now filter _all_ fields across Object, Interface, and Input types. For the previous Object-only behavior, switch to the `objectFieldFilter` option.
  - Unused `fieldNodes` utility functions have been removed.
  - Unused `typeContainsSelectionSet` function has been removed, and `typesContainSelectionSet` has been moved to the `stitch` package.
  - Unnecessary `Operation` type has been removed in favor of `OperationTypeNode` from upstream graphql-js.
  - As above, `applySchemaTransforms`/`applyRequestTransforms`/`applyResultTransforms` have been removed from the `utils` package, as they are implemented elsewhere or no longer necessary.

  ## Related Issues

  - proxy all the errors: #1047, #1641
  - better error handling for merges #2016, #2062
  - fix typings #1614
  - disable implicit schema pruning #1817
  - mocks not working for functions #1807

### Patch Changes

- Updated dependencies [be1a1575]
  - @graphql-tools/delegate@7.0.0
  - @graphql-tools/schema@7.0.0
  - @graphql-tools/utils@7.0.0
  - @graphql-tools/wrap@7.0.0
  - @graphql-tools/merge@6.2.5
  - @graphql-tools/batch-delegate@6.2.5

## 6.2.4

### Patch Changes

- 32c3c4f8: enhance(HoistFields): allow arguments
- 32c3c4f8: enhance(stitching): improve error message for unknown types
- 533d6d53: Bump all packages to allow adjustments
- Updated dependencies [32c3c4f8]
- Updated dependencies [32c3c4f8]
- Updated dependencies [32c3c4f8]
- Updated dependencies [32c3c4f8]
- Updated dependencies [533d6d53]
  - @graphql-tools/wrap@6.2.4
  - @graphql-tools/merge@6.2.4
  - @graphql-tools/utils@6.2.4
  - @graphql-tools/delegate@6.2.4
  - @graphql-tools/batch-delegate@6.2.4
  - @graphql-tools/schema@6.2.4
