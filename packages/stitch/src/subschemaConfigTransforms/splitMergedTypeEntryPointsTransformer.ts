import { cloneSubschemaConfig, SubschemaConfig } from '@graphql-tools/delegate';

export function splitMergedTypeEntryPointsTransformer(subschemaConfig: SubschemaConfig): Array<SubschemaConfig> {
  if (!subschemaConfig.merge) return [subschemaConfig];

  const maxEntryPoints = Object.values(subschemaConfig.merge).reduce((max: number, mergedTypeConfig) => {
    return Math.max(max, mergedTypeConfig?.entryPoints?.length ?? 0);
  }, 0);

  if (maxEntryPoints === 0) return [subschemaConfig];

  const subschemaPermutations = [];

  for (let i = 0; i < maxEntryPoints; i += 1) {
    const subschemaPermutation = cloneSubschemaConfig(subschemaConfig);
    const mergedTypesCopy = subschemaPermutation.merge;

    if (i > 0) {
      subschemaPermutation.merge = Object.create(null);
    }

    Object.keys(mergedTypesCopy).forEach(typeName => {
      const mergedTypeConfig = mergedTypesCopy[typeName];
      const mergedTypeEntryPoint = mergedTypeConfig?.entryPoints?.[i];

      if (mergedTypeEntryPoint) {
        if (mergedTypeConfig.selectionSet ?? mergedTypeConfig.fieldName ?? mergedTypeConfig.resolve) {
          throw new Error(
            `Merged type ${typeName} may not define entryPoints in addition to selectionSet, fieldName, or resolve`
          );
        }

        Object.assign(mergedTypeConfig, mergedTypeEntryPoint);
        delete mergedTypeConfig.entryPoints;

        if (i > 0) {
          delete mergedTypeConfig.canonical;
          if (mergedTypeConfig.fields != null) {
            Object.values(mergedTypeConfig.fields).forEach(mergedFieldConfig => {
              delete mergedFieldConfig.canonical;
            });
          }
        }

        subschemaPermutation.merge[typeName] = mergedTypeConfig;
      }
    });

    subschemaPermutations.push(subschemaPermutation);
  }

  return subschemaPermutations;
}
