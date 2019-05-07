const {
  readModel,
  writeModel,
} = require('./src')

const { GraphQLServerLambda } = require('graphql-yoga')

const typeDefs = `
  type Todo {
    title: String!
    completed: Boolean
  }

  type TodoList {
    id: ID!
    todos: [Todo]
  }
  
  type Query {
    getById(id: ID!): TodoList
  }

  type Mutation {
    addTodo(id: ID!, title: String!): Boolean
    removeTodo(id: ID!): Boolean
    completeTodo(id: ID!): Boolean
  }
`


const resolvers = {
	Mutation: {
		addTodo: (_, { id, title }) => writeModel.addTodo(id, { title }),
    removeTodo: (_, { id }) => writeModel.removeTodo(id),
    completeTodo: (_, { id }) => writeModel.completeTodo(id),
  },
  Query: {
    getById: async (_, { id }) => {
      await readModel.refresh()
      return await readModel.getById({ id })
    },
  }
}

const lambda = new GraphQLServerLambda({ 
  typeDefs, 
  resolvers,
})

module.exports.server = lambda.graphqlHandler
module.exports.playground = lambda.playgroundHandler