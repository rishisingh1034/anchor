// Central place for AWS SDK v3 client instances.
// MVP scope: S3, CloudFront, DynamoDB, Bedrock only.
import { S3Client } from "@aws-sdk/client-s3";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION ?? "us-east-1";

export const s3 = new S3Client({ region });
export const cloudfront = new CloudFrontClient({ region });
export const dynamoRaw = new DynamoDBClient({ region });
export const dynamo = DynamoDBDocumentClient.from(dynamoRaw);
export const bedrock = new BedrockRuntimeClient({ region });
