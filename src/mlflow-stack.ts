import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { AuroraServerlessV2Cluster } from './aws-aurora-serverless-v2';
import { CloudFront } from './aws-cloudfront';

export class MLflowStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });

    /** MySQL for MLflow */
    const db = new AuroraServerlessV2Cluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_3_02_1 }),
      instances: 1,
      instanceProps: {
        enablePerformanceInsights: true,
        vpc,
      },
      storageEncrypted: true,
      credentials: rds.Credentials.fromGeneratedSecret('admin'),
      defaultDatabaseName: 'mlflow',
    });

    /** Bucket for Artifacts of MLflow */
    const bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    /** MLflow ECS Cluser */
    const cluster = new ecs.Cluster(this, 'Cluster', {
      enableFargateCapacityProviders: true,
      vpc,
    });

    /** Cookie Secret for Oauth2 Proxy */
    const cookieSecret = new Secret(this, 'CookieSecret', {
      description: 'Cookie Secret for oauth2-proxy',
    });

    const oauthProvider = new cdk.CfnParameter(this, 'OauthProvider', {
      description: 'Oauth Provider',
      type: 'String',
      default: 'google',
      allowedValues: [
        'google',
        'github',
        'okta',
      ],
    });

    const clientId = new cdk.CfnParameter(this, 'ClientId', {
      description: 'Oauth 2.0 Client ID',
      type: 'String',
      default: '',
    });

    const clientSecret = new cdk.CfnParameter(this, 'ClientSecret', {
      description: 'Oauth 2.0 Client Secret',
      type: 'String',
      default: '',
      noEcho: true,
    });

    const jwtIssure = new cdk.CfnParameter(this, 'JwtIssure', {
      description: 'JWT Issure for Bearer Tokens',
      type: 'String',
      default: 'https://accounts.google.com=123456789012.apps.googleusercontent.com',
    });

    /** Oauth2 Proxy  */
    const oauthSecret = new Secret(this, 'OauthSecret', {
      description: 'Oauth 2.0 Client ID and Secret',
      secretObjectValue: {
        client_id: cdk.SecretValue.unsafePlainText(clientId.valueAsString),
        client_secret: cdk.SecretValue.cfnParameter(clientSecret),
        jwt_issure: cdk.SecretValue.unsafePlainText(jwtIssure.valueAsString),
      },
    });

    /** Generate Bearer Token Lambda Function */
    const tokenGenerator = new NodejsFunction(this, 'TokenGenerator', {
      description: 'Bearer Token Generator',
      entry: 'src/functions/generate-bearer-token.ts',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
    });
    const tokenGeneratorUrl = tokenGenerator.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    /** CloudWatch Logs for ECS containers */
    const logGroup = new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.TWO_WEEKS });

    /** AWS Logging Driver */
    const awsLogDriver = new ecs.AwsLogDriver({
      logGroup,
      streamPrefix: 'ecs',
    });

    /** MLflow Server */
    const app = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: 2048,
      memoryLimitMiB: 4096,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
      taskImageOptions: {
        containerName: 'oauth2-proxy',
        image: ecs.RepositoryImage.fromRegistry('quay.io/oauth2-proxy/oauth2-proxy:v7.4.0-arm64'),
        command: [
          '--http-address', '0.0.0.0:4180',
          '--reverse-proxy', 'true',
          '--pass-host-header', 'false',
          //'--upstream', 'http://localhost:5000/',
          //'--upstream', `${tokenGeneratorUrl.url}token/`,
          '--upstream', `${tokenGeneratorUrl.url}`,
          // ヘルスチェック
          '--ping-path', '/ping',
          '--silence-ping-logging', 'true',
          // カスタマイズ
          '--custom-sign-in-logo', 'https://mlflow.org/docs/latest/_static/MLflow-logo-final-black.png',
          '--banner', 'Machine Learning Lifecycle Platform',
          '--footer', 'Turing Motors, Inc.',
        ],
        containerPort: 4180,
        environment: {
          // 認証
          OAUTH2_PROXY_PROVIDER: oauthProvider.valueAsString,
          OAUTH2_PROXY_EMAIL_DOMAINS: '*',
          OAUTH2_PROXY_SKIP_JWT_BEARER_TOKENS: 'true',
        },
        secrets: {
          OAUTH2_PROXY_CLIENT_ID: ecs.Secret.fromSecretsManager(oauthSecret, 'client_id'),
          OAUTH2_PROXY_CLIENT_SECRET: ecs.Secret.fromSecretsManager(oauthSecret, 'client_secret'),
          OAUTH2_PROXY_EXTRA_JWT_ISSUERS: ecs.Secret.fromSecretsManager(oauthSecret, 'jwt_issure'),
          OAUTH2_PROXY_COOKIE_SECRET: ecs.Secret.fromSecretsManager(cookieSecret),
        },
        logDriver: awsLogDriver,
      },
    });

    app.taskDefinition.addContainer('mlflow', {
      containerName: 'mlflow',
      image: ecs.AssetImage.fromAsset( 'containers/mlflow', { platform: Platform.LINUX_ARM64 }),
      environment: {
        BUCKET_NAME: `s3://${bucket.bucketName}`,
        DB_HOST: db.clusterEndpoint.hostname,
        DB_POST: db.clusterEndpoint.port.toString(),
      },
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(db.secret!, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
        DB_NAME: ecs.Secret.fromSecretsManager(db.secret!, 'dbname'),
      },
      logging: awsLogDriver,
    });

    /** ロードバランサーのヘルスチェックの設定を上書き */
    app.targetGroup.configureHealthCheck({
      path: '/ping',
      timeout: cdk.Duration.seconds(3),
      interval: cdk.Duration.seconds(5),
    });

    /** MLflow から DB へのアクセスを許可するセキュリティグループの設定 */
    app.service.connections.allowToDefaultPort(db);

    /** DB が立ち上がってから MLflow を起動する依存関係 */
    app.service.node.defaultChild?.node.addDependency(db.node.findChild('Instance1'));

    /** MLflow から S3 Bucket への読み書きを許可 */
    bucket.grantReadWrite(app.taskDefinition.taskRole);

    /** CDN */
    const cdn = new CloudFront(this, 'CDN', { originLoadBalancer: app.loadBalancer });
    app.taskDefinition.defaultContainer?.addEnvironment('OAUTH2_PROXY_REDIRECT_URL', `https://${cdn.distribution.distributionDomainName}/oauth2/callback`);

    new cdk.CfnOutput(this, 'Url', { value: `https://${cdn.distribution.distributionDomainName}` });
  }
}
