const initialState = {
  todos: []
}

const reducer = (state, event) => {
  const { todos } = state

  switch (event.type) {
    case 'TodoAdded':
      return {
        todos: [
          ...todos,
          { title: event.title, completed: false },
        ]
      }
 
    case 'TodoRemoved':
      return {
        todos: [
          ...todos.slice(0, event.index),
          ...todos.slice(event.index + 1),
        ]
       }
   
    case 'TodoCompleted':
      return {
        todos: [
          ...todos.slice(0, event.index),
          { ...todos[event.index], completed: true },
          ...todos.slice(event.index + 1),
        ]
      }

    default:
      return state
  }
}

module.exports = (events, state=initialState) => events.reduce(reducer, state)