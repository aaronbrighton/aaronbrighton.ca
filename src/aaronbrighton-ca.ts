import * as path from 'path';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct, Stack, StackProps, Duration } from '@aws-cdk/core';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';

export class AaronBrightonCaStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const domains = [
      'aaronbrighton.ca',
      'www.aaronbrighton.ca',
    ];

    const publicZone = route53.HostedZone.fromHostedZoneAttributes(this, 'route53-zone', {
      hostedZoneId: 'ZRZJWLXW3FS0K',
      zoneName: 'aaronbrighton.ca',
    });

    const customCertificate = new acm.Certificate(this, 'custom-certificate', {
      domainName: domains[0],
      subjectAlternativeNames: domains.slice(1),
      validation: acm.CertificateValidation.fromDns(publicZone),
    });

    const cloudfrontToS3Resource = new CloudFrontToS3(this, 'cloudfront-s3', {
      insertHttpSecurityHeaders: false,
      cloudFrontDistributionProps: {
        certificate: customCertificate,
        domainNames: domains,
      },
    });

    let counter: number = 0;
    domains.forEach((domain) => {
      counter += 1;

      new route53.ARecord(this, `route53-a-record${counter}`, {
        zone: publicZone,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cloudfrontToS3Resource.cloudFrontWebDistribution)),
        recordName: domain,
      });

      new route53.AaaaRecord(this, `route53-aaaa-record${counter}`, {
        zone: publicZone,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cloudfrontToS3Resource.cloudFrontWebDistribution)),
        recordName: domain,
      });
    });

    if (cloudfrontToS3Resource.s3Bucket) {
      new s3deploy.BucketDeployment(this, 'website-deploy', {
        sources: [s3deploy.Source.asset(path.join(__dirname, 'hugo/public'))],
        destinationBucket: cloudfrontToS3Resource.s3Bucket,
        cacheControl: [
          s3deploy.CacheControl.setPublic(),
          s3deploy.CacheControl.mustRevalidate(),
          s3deploy.CacheControl.maxAge(Duration.minutes(1)),
        ],
        distribution: cloudfrontToS3Resource.cloudFrontWebDistribution,
      });
    }
  }
}