import { graphql } from 'graphql';

import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { ExecutionResult, isAsyncIterable } from '@graphql-tools/utils';

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
        test: 'test',
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
        test: 'test',
      },
      hasNext: false,
      path: ['object'],
    });
  });

  test('should work for merged fields', async () => {
    const schema1 = makeExecutableSchema({
      typeDefs: `
        type Object {
          id: ID
          field1: String
        }
        type Query {
          object(id: ID): Object
        }
      `,
      resolvers: {
        Object: {
          field1: () => 'field1',
        },
        Query: {
          object: () => ({ id: '1' }),
        }
      },
    });

    const schema2 = makeExecutableSchema({
      typeDefs: `
        type Object {
          id: ID
          field2: String
        }
        type Query {
          object(id: ID): Object
        }
      `,
      resolvers: {
        Object: {
          field2: () => 'field2',
        },
        Query: {
          object: () => ({ id: '1' }),
        }
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [{
        schema: schema1,
        merge: {
          Object: {
            selectionSet: '{ id }',
            fieldName: 'object',
            args: ({ id }) => ({ id }),
          },
        },
      }, {
        schema: schema2,
        merge: {
          Object: {
            selectionSet: '{ id }',
            fieldName: 'object',
            args: ({ id }) => ({ id }),
          },
        },
      }],
    });

    const result = await graphql(
      stitchedSchema,
      `
        query {
          object(id: "1") {
            ... on Object @defer {
              field1
              field2
            }
          }
        }
      `,
    );

    expect((result as ExecutionResult).errors).toBeUndefined();

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
        field1: 'field1',
        field2: 'field2',
      },
      hasNext: false,
      path: ['object'],
    });
  });
});
