#!/usr/bin/env bash
# One-time: create the GitHub Actions OIDC deploy role for this repo.
# Idempotent: re-run to (re)apply the trust + permissions policy.
set -euo pipefail

ROLE_NAME="${ROLE_NAME:-ai-systmem-design-studio-deploy}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
PROVIDER_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
REPO="alexeygrigorev/ai-system-design-interview-studio"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/trust.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${PROVIDER_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:ref:refs/heads/main"
        }
      }
    }
  ]
}
EOF

# Mirrors the ai-engineering-gym deploy role: CloudFormation / Lambda / API
# Gateway / ACM / Route53 / Logs / the deploy S3 bucket / IAM (PassRole) /
# Events (keep-warm). No DynamoDB (this app is stateless).
cat > "$TMP/policy.json" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Identity", "Effect": "Allow", "Action": "sts:GetCallerIdentity", "Resource": "*" },
    { "Sid": "CloudFormation", "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" },
    { "Sid": "Lambda", "Effect": "Allow", "Action": "lambda:*", "Resource": "*" },
    { "Sid": "ApiGateway", "Effect": "Allow", "Action": "apigateway:*", "Resource": "*" },
    { "Sid": "Acm", "Effect": "Allow", "Action": "acm:*", "Resource": "*" },
    { "Sid": "Route53", "Effect": "Allow", "Action": [
        "route53:ChangeResourceRecordSets", "route53:GetHostedZone", "route53:ListHostedZones",
        "route53:ListHostedZonesByName", "route53:ListResourceRecordSets", "route53:GetChange"
      ], "Resource": "*" },
    { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*", "Resource": "*" },
    { "Sid": "S3DeployBucket", "Effect": "Allow", "Action": "s3:*",
      "Resource": [ "arn:aws:s3:::ai-sds-deploy-*", "arn:aws:s3:::ai-sds-deploy-*/*" ] },
    { "Sid": "Iam", "Effect": "Allow", "Action": [
        "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy",
        "iam:DeleteRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:GetRolePolicy",
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"
      ], "Resource": "*" },
    { "Sid": "Events", "Effect": "Allow", "Action": "events:*", "Resource": "*" }
  ]
}
EOF

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> updating trust policy on existing role ${ROLE_NAME}"
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document file://"$TMP/trust.json"
else
  echo "==> creating role ${ROLE_NAME}"
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document file://"$TMP/trust.json" \
    --description "GitHub Actions OIDC deploy role for ai-systmem-design-studio" >/dev/null
fi

echo "==> putting permissions policy"
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name "${ROLE_NAME}-permissions" \
  --policy-document file://"$TMP/policy.json"

echo "==> done. GitHub Actions assumes:"
echo "    arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"
