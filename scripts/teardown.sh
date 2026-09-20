#!/usr/bin/env bash
set -e

echo "=========================================="
echo "      Anchor AWS Resource Teardown        "
echo "=========================================="

REGION="us-east-1"
APP_ID="dnnu4lkh82cpn"
ROLE_NAME="anchor-amplify-service-role"
TABLE_NAME="deployments"

echo "1. Deleting Amplify App ($APP_ID)..."
aws amplify delete-app --app-id "$APP_ID" --region "$REGION" 2>/dev/null || echo "Amplify app already deleted."

echo "2. Deleting S3 Buckets (anchor-site-*)..."
for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'anchor-site')].Name" --output text 2>/dev/null); do
  echo "   Emptying and deleting s3://$bucket..."
  aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
  aws s3api delete-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null || true
done

echo "3. Deleting DynamoDB Table ($TABLE_NAME)..."
aws dynamodb delete-table --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null || echo "DynamoDB table already deleted."
aws dynamodb delete-table --table-name "$TABLE_NAME" --region "ap-south-1" 2>/dev/null || true

echo "4. Deleting IAM Roles ($ROLE_NAME, anchor-amplify-compute-role)..."
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess-Amplify" 2>/dev/null || true
aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "anchor-runtime-policy" 2>/dev/null || true
aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || echo "Service role already deleted."

aws iam delete-role-policy --role-name "anchor-amplify-compute-role" --policy-name "anchor-runtime-policy" 2>/dev/null || true
aws iam delete-role --role-name "anchor-amplify-compute-role" 2>/dev/null || echo "Compute role already deleted."

echo "5. Deleting CloudWatch Log Group (/aws/amplify/$APP_ID)..."
aws logs delete-log-group --log-group-name "/aws/amplify/$APP_ID" --region "$REGION" 2>/dev/null || true

echo "6. Disabling Anchor CloudFront Distributions..."
# Find all distributions created by Anchor (comment starts with "Anchor deployment for")
DIST_IDS=$(aws cloudfront list-distributions --query "DistributionList.Items[?starts_with(Comment || '', 'Anchor deployment for')].Id" --output text 2>/dev/null || true)
if [ -z "$DIST_IDS" ]; then
  DIST_IDS="ET5B69YMX3I3K E31I6DMNGH3XXW EOFWAG4RAK1A0 E2B5HHTVGQ147L E1Y1OQKQLKNW39"
fi

for dist_id in $DIST_IDS; do
  ETAG=$(aws cloudfront get-distribution-config --id "$dist_id" --query "ETag" --output text 2>/dev/null || true)
  if [ -n "$ETAG" ]; then
    echo "   Disabling distribution $dist_id..."
    aws cloudfront get-distribution-config --id "$dist_id" --query "DistributionConfig" > /tmp/dist-config.json 2>/dev/null
    sed -i 's/"Enabled": true/"Enabled": false/' /tmp/dist-config.json
    aws cloudfront update-distribution --id "$dist_id" --if-match "$ETAG" --distribution-config file:///tmp/dist-config.json > /dev/null 2>&1 || true
  fi
done

echo "7. Deleting Anchor Origin Access Controls (OAC)..."
for oac_id in $(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?starts_with(Name, 'anchor-')].Id" --output text 2>/dev/null || true); do
  echo "   Deleting OAC $oac_id..."
  ETAG=$(aws cloudfront get-origin-access-control --id "$oac_id" --query "ETag" --output text 2>/dev/null || true)
  aws cloudfront delete-origin-access-control --id "$oac_id" --if-match "$ETAG" 2>/dev/null || true
done

echo "=========================================="
echo "Teardown complete!"
echo "Note: CloudFront distributions are now disabled and will be ready for final deletion in ~2 minutes."
echo "=========================================="
