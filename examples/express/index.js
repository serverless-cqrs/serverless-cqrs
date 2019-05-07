const {
  readModel,
  writeModel,
} = require('./src')

const serverless = require('serverless-http');
const express = require('express')
const app = express()

app.use(express.json())


app.get('/:id', (req, res, next) => {
  readModel.refresh()
  .then(() => readModel.getById({ 
    id: req.params.id, 
  }))
  .then(obj => {
    if (!obj) throw new Error('Not Found')
    res.json(obj)
  })
  .catch(next)
})

app.post('/', (req, res, next) => {
  writeModel.addTodo(req.body.id, { 
    title: req.body.title,
  })
  .then(res.json.bind(res))
  .catch(next)
})

app.put('/:id/:index', (req, res, next)  => {
  writeModel.completeTodo(req.params.id, { 
    index: parseInt(req.params.index),
  })
  .then(res.json.bind(res))
  .catch(next)
})

app.delete('/:id/:index', (req, res, next)  => {
  writeModel.removeTodo(req.params.id, { 
    index: req.params.index,
  })
  .then(res.json.bind(res))
  .catch(next)
})

app.use(function(error, req, res, next) {
  console.log(error)
  res.status(500).json({ message: error.message });
});

module.exports.handler = serverless(app);
