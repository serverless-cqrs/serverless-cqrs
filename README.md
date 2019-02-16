## About
`serverless-cqrs` is collection tools to help you get started with building a fully functioning backend based on the principles of [CQRS](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs), [Event Sourcing](http://www.cqrs.nu/Faq/event-sourcing), [Domain Driven Design](https://medium.com/the-coding-matrix/ddd-101-the-5-minute-tour-7a3037cf53b8), [and Onion Architecture](https://www.codeguru.com/csharp/csharp/cs_misc/designtechniques/understanding-onion-architecture.html).

The goal is twofold: 
- Write as little boilerplate code as possible.
- Clean service boundaries so that parts can be easily tested and swapped out.

## Readme
https://serverless-cqrs.gitbook.io/serverless-cqrs  
https://medium.com/@yonah.forst/introducing-serverless-cqrs-24471045c08d  
https://medium.com/@yonah.forst/getting-started-with-serverless-cqrs-part-2-2ea4ac114439  


## Quickstart 
### Install
```
npm i --save serverless-cqrs
npm i --save serverless-cqrs.memory-adapter
```
### Usage
To start, you need Actions and a Reducer. So let's write simple ones:
```js
// actions.js
const actions = {
  addTodo: (state, payload) => {
    if (!payload.title) throw new Error('titleMissing')
    
    return [{
      type: 'TodoAdded',
      title: payload.title,
      at: Date.now(),
    }]
  }
}

module.exports = actions
```
```js
// reducer.js
const initialState = {
  todos: []
}

const reducer = (state, event) => {
  switch (event.type) {
    case 'TodoAdded':
      return {
        todos: [
          ...state.todos,
          { title: event.title },
        ]
      }
      
    default:
      return state
  }
}

module.exports = (events, state=initialState) => events.reduce(reducer, state)
```

Above we have a basic action and reducer. 

The action, `addTodo`, does some basic validation to check the presence of a title and if it succeeds, returns a new event with the type `TodoAdded`. 
When that event is run through the reducer, a new todo is appended to the list.

Next, we build an adapter to help us persist the events.
```js
// adapter.js
const memoryAdapterBuilder = require('serverless-cqrs.memory-adapter')
module.exports = memoryAdapterBuilder.build({ 
  entityName: 'todo'
})
```

This adapter will let us persist events and read-model projections in memory.  
Finally, we use these to build our read and write model.
```js
// index.js
const {
  writeModelBuilder,
  readModelBuilder,
} = require('serverless-cqrs')

const actions = require('./actions')
const reducer = require('./reducer')
const adapter = require('./adapter')

module.exports.writeModel = writeModelBuilder.build({
  actions,
  reducer,
  adapter,
})

module.exports.readModel = readModelBuilder.build({
  reducer,
  adapter,
  eventAdapter: adapter,
})
```

That's it!

### Try it live
https://repl.it/@yonahforst/serverless-cqrs-quickstart
