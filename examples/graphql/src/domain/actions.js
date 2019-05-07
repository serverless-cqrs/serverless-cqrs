module.exports = {
  addTodo: (state, payload) => {
    if (!payload.title) throw new Error('titleMissing')
    return [{
      type: 'TodoAdded',
      title: payload.title,
      at: Date.now(),
    }]
  },

  removeTodo: (state, payload) => {
    if (!payload.index) throw new Error('indexMissing')
    if (payload.index >= state.todos.length || payload.index < 0) throw new Error('invalidIndex')

    return [{
      type: 'TodoRemoved',
      index: payload.index,
      at: Date.now(),
    }]
  },

  completeTodo: (state, payload) => {
    if (typeof payload.index === 'undefined') throw new Error('indexMissing')
    if (payload.index >= state.todos.length || payload.index < 0) throw new Error('invalidIndex')

    return [{
      type: 'TodoCompleted',
      index: payload.index,
      at: Date.now(),
    }]
  },
}
