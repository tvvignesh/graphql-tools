import { graphql } from 'graphql';

import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { isAsyncIterable } from '@graphql-tools/utils';

describe('defer support', () => {
  test('should work for root fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Query {
          test: String
        }
      `,
      resolvers: {
        Query: {
          test: () => 'test',
        }
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [schema]
    });

    const result = await graphql(
      stitchedSchema,
      `
        query {
          ... on Query @defer {
            test
          }
        }
      `,
    );

    const results = [];
    if (isAsyncIterable(result)) {
      for await (const patch of result) {
        results.push(patch);
      }
    }

    expect(results[0]).toEqual({
      data: {},
      hasNext: true,
    });
    expect(results[1]).toEqual({
      data: {
        test: 'test'
      },
      hasNext: false,
      path: [],
    });
  });

  test('should work for nested fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Object {
          test: String
        }
        type Query {
          object: Object
        }
      `,
      resolvers: {
        Object: {
          test: () => 'test',
        },
        Query: {
          object: () => ({}),
        }
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [schema]
    });

    const result = await graphql(
      stitchedSchema,
      `
        query {
          object {
            ... on Object @defer {
              test
            }
          }
        }
      `,
    );

    const results = [];
    if (isAsyncIterable(result)) {
      for await (const patch of result) {
        results.push(patch);
      }
    }

    expect(results[0]).toEqual({
      data: { object: {} },
      hasNext: true,
    });
    expect(results[1]).toEqual({
      data: {
        test: 'test'
      },
      hasNext: false,
      path: ['object'],
    });
  });
});
