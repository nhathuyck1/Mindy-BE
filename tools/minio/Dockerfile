FROM golang:1.24.8-alpine AS build
RUN apk add --no-cache git
RUN GOBIN=/out go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates && addgroup -g 10001 storage && adduser -D -u 10001 -G storage storage && mkdir /data && chown storage:storage /data
COPY --from=build /out/minio /usr/local/bin/minio
USER storage
EXPOSE 9000
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
