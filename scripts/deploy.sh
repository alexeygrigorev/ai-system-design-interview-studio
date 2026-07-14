#!/usr/bin/env bash
# Build the Lambda package and deploy via CloudFormation.
# Idempotent: re-run to ship new code / update the stack.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-eu-west-1}"
STACK="${STACK:-ai-systmem-design-studio}"
DOMAIN="${DOMAIN:-sds.dtcdev.click}"
ZONE="${ZONE:-Z05963572WVWFHDQZH5NE}"        # authoritative dtcdev.click zone
PASSPHRASE="${STUDIO_PASSPHRASE:-aislgym}"   # passphrase gate (same default as the gym)

if [ -z "${ZAI_API_KEY:-}" ]; then
  echo "ERROR: ZAI_API_KEY is not set. Export it or pass via env." >&2
  exit 1
fi

# Stable across deploys when provided by CI (secrets.STUDIO_SESSION_SECRET);
# otherwise generated per-run (sessions reset each deploy).
SESSION_SECRET="${SESSION_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}"
AUTH_STACK="${AUTH_STACK:-dtcdev-shared-auth}"
auth_output() {
  aws cloudformation describe-stacks --region us-east-1 --stack-name "$AUTH_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
AUTH_CLIENT_ID="${AUTH_CLIENT_ID:-$(auth_output SystemDesignStudioClientId)}"
AUTH_ISSUER="${AUTH_ISSUER:-$(auth_output IssuerUrl)}"
AUTH_JWKS_URL="${AUTH_JWKS_URL:-$(auth_output JwksUrl)}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="ai-sds-deploy-${ACCOUNT}-${REGION}"
KEY="lambda/build-$(date +%s).zip"

echo "==> installing deps"
npm ci

echo "==> building app (typecheck + frontend)"
npm run build

echo "==> bundling lambda handler with esbuild"
npm run build:lambda

echo "==> assembling package"
rm -rf build/pkg && mkdir -p build/pkg
cp build/lambda/server.cjs build/pkg/server.cjs
cp -r dist build/pkg/dist
cp -r ai_engineering_interviewer_prompts build/pkg/ai_engineering_interviewer_prompts
# Lambda Web Adapter bootstrap: the function Handler (run.sh) execs the bundled
# HTTP server; LWA proxies Function URL (RESPONSE_STREAM) invocations to it on
# AWS_LWA_PORT, which is what lets /api/interview/turn/stream flush per-token.
printf '#!/bin/sh\nexec node /var/task/server.cjs\n' > build/pkg/run.sh
chmod +x build/pkg/run.sh

echo "==> zipping"
rm -f build/lambda.zip
python3 -c "import shutil; shutil.make_archive('build/lambda','zip','build/pkg')"
echo "    package: $(du -h build/lambda.zip | cut -f1)"

echo "==> ensuring code bucket ${BUCKET}"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi
aws s3 cp build/lambda.zip "s3://${BUCKET}/${KEY}" >/dev/null

echo "==> deploying CloudFormation stack ${STACK} (region ${REGION})"
aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
  --template-file infra/cloudformation.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    CodeBucket="$BUCKET" CodeKey="$KEY" \
    DomainName="$DOMAIN" HostedZoneId="$ZONE" \
    ZaiApiKey="$ZAI_API_KEY" \
    Passphrase="$PASSPHRASE" SessionSecret="$SESSION_SECRET" \
    AuthClientId="$AUTH_CLIENT_ID" AuthIssuer="$AUTH_ISSUER" AuthJwksUrl="$AUTH_JWKS_URL"

echo "==> outputs"
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs" --output table
