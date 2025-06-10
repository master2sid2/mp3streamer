FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o mp3server ./cmd


FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /build/mp3server /app/mp3server

COPY --from=builder /build/static /app/static
COPY --from=builder /build/templates /app/templates

EXPOSE 8085

CMD ["/app/mp3server"]

