FROM alpine:3.22
RUN apk add --no-cache bash curl jq postgresql-client restic
WORKDIR /backup
COPY backup.sh entrypoint.sh ./
RUN chmod +x /backup/*.sh
ENTRYPOINT ["/backup/entrypoint.sh"]
