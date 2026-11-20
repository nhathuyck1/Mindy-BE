FROM golang:1.24.8-alpine AS build
RUN apk add --no-cache git
RUN GOBIN=/out go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates jq && addgroup -g 10001 provision && adduser -D -u 10001 -G provision provision
COPY --from=build /out/mc /usr/local/bin/mc
COPY provision-production.sh /usr/local/bin/provision-production.sh
USER provision
ENV MC_CONFIG_DIR=/tmp/mc
ENTRYPOINT ["/bin/sh", "/usr/local/bin/provision-production.sh"]
