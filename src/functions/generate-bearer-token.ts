import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, Handler } from 'aws-lambda';
import jwt from 'jsonwebtoken';

const region = process.env.AWS_REGION;
const secretArn = process.env.SECRET_ARN!;

const getSecret = async (secretId: string) => {
  const client = new SecretsManagerClient({ region });
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const { SecretString } = await client.send(cmd);
  console.log('Get secret successfully.');
  client.destroy();
  return SecretString!;
};

export const handler: Handler<APIGatewayProxyEventV2, any> = async (event, context) => {
  console.log(JSON.stringify(event));
  //const jwtSecret = await getSecret(secretArn);
  //const token = jwt.sign(payload, jwtSecret, {
  //  issuer: context.invokedFunctionArn,
  //  expiresIn: '10y' });
  return event;
};