import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

interface ScalingProps {
  minCapacity: number;
  maxCapacity: number;
}

export class AuroraServerlessV2Cluster extends rds.DatabaseCluster {

  /** Aurora Serverless v2 */
  constructor(scope: Construct, id: string, props: rds.DatabaseClusterProps) {
    super(scope, id, props);

    /** DB Instance のリスト */
    const instances = this.node.children.filter(child => child.node.id.startsWith('Instance')) as rds.CfnDBInstance[];

    /** InstanceClass を上書きする */
    instances.map(instance => instance.dbInstanceClass = 'db.serverless');

    /** ACU の初期値を設定 */
    this.configureScaling({ maxCapacity: 32, minCapacity: 0.5 });
  }

  /** Aurora Capacity Units の設定 */
  configureScaling(props: ScalingProps) {
    const dbCluster = this.node.defaultChild as rds.CfnDBCluster;
    dbCluster.serverlessV2ScalingConfiguration = props;
  }
}