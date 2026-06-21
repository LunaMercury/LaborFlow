FROM rust:1-bookworm AS build

WORKDIR /app
COPY backend-fast/Cargo.toml backend-fast/Cargo.lock ./
COPY backend-fast/src ./src
RUN cargo build --release

FROM debian:trixie-slim

WORKDIR /app
RUN useradd --create-home --shell /usr/sbin/nologin laborflow
COPY --from=build /app/target/release/laborflow-backend-fast /usr/local/bin/laborflow-backend-fast

ENV LABORFLOW_FAST_BIND_ADDR=0.0.0.0:5582
EXPOSE 5582
USER laborflow

ENTRYPOINT ["/usr/local/bin/laborflow-backend-fast"]
