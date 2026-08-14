FROM node:20-bookworm-slim

RUN useradd --system --create-home --home-dir /var/lib/orca-relay orca-relay
WORKDIR /opt/orca-relay
COPY server.cjs ./server.cjs
RUN mkdir -p /var/lib/orca-relay/data && chown -R orca-relay:orca-relay /var/lib/orca-relay

USER orca-relay
ENV ORCA_RELAY_HOST=0.0.0.0
ENV ORCA_RELAY_PORT=8787
ENV ORCA_RELAY_DATA_PATH=/var/lib/orca-relay/data/relay-state.json
EXPOSE 8787
VOLUME ["/var/lib/orca-relay/data"]
CMD ["node", "/opt/orca-relay/server.cjs"]
