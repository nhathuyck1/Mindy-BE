#!/bin/sh
# One-off provisioning, no shell tracing or credentials printed to stdout.
set -eu
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

for variable in MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET; do
  value=$(printenv "$variable") || fail "Missing $variable"
  case "$value" in
    ''|CHANGE_*|ACCESS_KEY_*|SECRET_KEY_*) fail "Replace placeholder for $variable" ;;
  esac
done
[ "${#MINIO_ROOT_PASSWORD}" -ge 16 ] || fail 'Use a root password of at least 16 characters'
[ "${#MINIO_SECRET_KEY}" -ge 16 ] || fail 'Use a backend secret of at least 16 characters'
[ "$MINIO_ACCESS_KEY" != "$MINIO_ROOT_USER" ] || fail 'Backend must use a separate user'
# Bound and validate bucket interpolation into policy resources/name.
[ "${#MINIO_BUCKET}" -ge 3 ] && [ "${#MINIO_BUCKET}" -le 63 ] || fail 'Invalid bucket length'
case "$MINIO_BUCKET" in
  *[!a-z0-9.-]*|[!a-z0-9]*|*[!a-z0-9]|*..*) fail 'Invalid bucket name' ;;
esac

mc alias set admin http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 \
  || fail 'Cannot connect as MinIO admin; check root credentials and MinIO health'
target="admin/$MINIO_BUCKET"
mc mb --ignore-existing "$target" >/dev/null || fail 'Cannot create/check bucket'
# Refuse any existing bucket policy, matching the API's private bucket requirement.
mc anonymous get-json --json "$target" > /tmp/bucket-policy.json \
  || fail 'Cannot inspect bucket policy'
jq -e '.status == "success" and .permission == "private" and ((.anonymous // {}) | length) == 0' \
  /tmp/bucket-policy.json >/dev/null || fail 'Bucket has an existing policy; review it before provisioning'
mc version enable "$target" >/dev/null || fail 'Cannot enable versioning'
mc version info --json "$target" > /tmp/bucket-version.json
jq -e '.status == "success" and .versioning.status == "Enabled"' /tmp/bucket-version.json >/dev/null \
  || fail 'Bucket versioning is not enabled'

# Fail on admin/network errors instead of treating a failed lookup as an absent user.
mc admin user ls --json admin > /tmp/users.json || fail 'Cannot inspect existing MinIO users'
# mc emits a stream of user JSON objects; jq -s handles an empty/new deployment too.
if ! jq -s -e --arg user "$MINIO_ACCESS_KEY" 'any(.[]; .accessKey == $user)' /tmp/users.json >/dev/null; then
  mc admin user add admin "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 \
    || fail 'Cannot create backend user'
fi
policy="mindy-files-$MINIO_BUCKET"
jq -n --arg bucket "$MINIO_BUCKET" '{
  Version: "2012-10-17",
  Statement: [
    {Effect: "Allow", Action: ["s3:GetBucketLocation", "s3:GetBucketVersioning", "s3:GetBucketPolicy", "s3:ListBucket"], Resource: ["arn:aws:s3:::" + $bucket]},
    {Effect: "Allow", Action: ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"], Resource: ["arn:aws:s3:::" + $bucket + "/*"]},
    {Effect: "Allow", Action: ["s3:DeleteObjectVersion"], Resource: ["arn:aws:s3:::" + $bucket + "/chat-staging/*", "arn:aws:s3:::" + $bucket + "/chat-final/*"]}
  ]
}' > /tmp/backend-policy.json
mc admin policy create admin "$policy" /tmp/backend-policy.json >/dev/null \
  || fail 'Cannot create bucket-scoped backend policy'
mc admin policy attach admin "$policy" --user "$MINIO_ACCESS_KEY" >/dev/null \
  || fail 'Cannot attach backend policy'

mc alias set backend http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 \
  || fail 'Backend credentials do not match MinIO user; existing passwords are not changed'
mc stat "backend/$MINIO_BUCKET" >/dev/null 2>&1 \
  || fail 'Backend cannot access bucket; check credentials/account status/policy'
printf '%s\n' 'MinIO private bucket, versioning and backend credentials are ready.'
