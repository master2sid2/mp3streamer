FROM golang:1.24.3-alpine AS builder

RUN apk add --no-cache git
WORKDIR /build

COPY . .

RUN go mod download
RUN CGO_ENABLED=0 go build -o mp3server ./cmd


FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /app

COPY --from=builder /build/mp3server /app/mp3server
COPY --from=builder /build/static /app/static
COPY --from=builder /build/templates /app/templates

EXPOSE 8085

CMD ["/app/mp3server"]
