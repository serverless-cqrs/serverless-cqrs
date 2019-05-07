# Express

## Description

First, make sure you've run `npm i -g serverless` and added your [AWS credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials/).

Deploying for the first time can take 10-20 minutes since it needs to create the ElasticSearch instance. If there is an error, you may get `ROLLBACK_IN_PROGRESS` the next time you try to deploy. Give it a few minutes and then try again.

```text
git clone git@github.com:serverless-cqrs/serverless-cqrs.git
cd serverless-cqrs/examples/express
npm i
serverless deploy
```

The deploy output will list your endpoint URL to which you can send `GET`, `PUT`, `POST`, and `DELETE` requests:

```text
curl -H "Content-Type: application/json"
  -X POST -d '{"id":"123","title":"Get milk"}'
  https://XXXXXXX.execute-api.XXXXX.amazonaws.com/dev
# null

curl https://XXXXXXX.execute-api.XXXXX.amazonaws.com/dev/123
# {"id":"123","todos":[{"title":"Get Milk","completed":false}]}

```

The AWS Free Tier covers most of these services, but running an ElasticSearch instance on AWS can be expensive. Make sure to run `serverless remove` once you're done.
