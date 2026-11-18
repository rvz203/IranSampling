FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && addgroup -S sampling && adduser -S sampling -G sampling && mkdir -p /data/uploads && chown -R sampling:sampling /data
WORKDIR /app
COPY --from=build /server /app/server
USER sampling
EXPOSE 8080
CMD ["/app/server"]
