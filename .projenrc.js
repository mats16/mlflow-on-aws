const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.67.0',
  defaultReleaseBranch: 'main',
  name: 'mlflow-on-aws',
  description: 'MLflow on AWS',
  deps: [
    '@aws-sdk/client-secrets-manager',
    '@types/aws-lambda',
    'jsonwebtoken@^9.0.0',
  ],
  devDeps: [
    '@types/jsonwebtoken',
  ],
  tsconfig: {
    compilerOptions: {
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
  },
  depsUpgrade: false,
});
project.synth();