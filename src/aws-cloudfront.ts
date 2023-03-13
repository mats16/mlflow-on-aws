import * as cdk from 'aws-cdk-lib';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { LoadBalancerV2Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface CloudFrontProps {
  originLoadBalancer: elb.ILoadBalancerV2;
}

export class CloudFront extends Construct {
  /** CloudFront Distribution */
  distribution: cf.IDistribution;

  /** CDN を簡単に構成できる Construct */
  constructor(scope: Construct, id: string, props: CloudFrontProps) {
    super(scope, id);

    /** オリジン */
    const origin = new LoadBalancerV2Origin(props.originLoadBalancer, {
      protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
    });

    /** 動的コンテンツ向けの Behavior */
    const apiBehavior: cf.BehaviorOptions = {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
      responseHeadersPolicy: cf.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      origin,
    };

    /** 静的コンテンツ向けの　Behavior */
    const defaultBehavior: cf.BehaviorOptions = {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
      responseHeadersPolicy: cf.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      origin,
    };

    this.distribution = new cf.Distribution(this, 'Distribution', {
      httpVersion: cf.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      comment: `${this.node.path}/Distribution`,
      defaultBehavior,
      additionalBehaviors: {
        '/api/*': apiBehavior,
        '/ajax-api/*': apiBehavior,
        '/oauth2/*': apiBehavior,
      },
    });

  }
}