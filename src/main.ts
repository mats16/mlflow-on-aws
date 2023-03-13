import { App } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MLflowStack } from './mlflow-stack';

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MLflowStack(app, 'MLflow', { env: devEnv });
// new MyStack(app, 'ml-sandbox-prod', { env: prodEnv });

app.synth();