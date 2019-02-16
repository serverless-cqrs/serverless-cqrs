
A library that implements the Read Model Adapter interface for storing projections on AWS ElasticSearch.

### Methods
##### `build`
```js
build({ entityName }, { endpoint )
```
builds a read-model adapter 

##### Parameters
attribute | type | description
--------- | ---- | -----------
entityName | string | the name of the entity
endpoint | string | the ElasticSearch instance endpoint url

##### Returns
an object with read model methods

##### Example
```js
const elasticAdapterBuilder = require('serverless-cqrs.elasticsearch-adapter')
module.exports = elasticAdapterBuilder.build({ 
  entityName: 'todo'
}, {
  endpoint: 'https://xxxxxx.yyy/zzzz/1234',
})
```
