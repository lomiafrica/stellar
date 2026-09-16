# Official Anchor Platform image plus this repo's testnet config.
# SEP-1 toml is served by the lab (HOME_DOMAIN), not this container.
FROM stellar/anchor-platform:2.11.3
COPY anchor/config /config
ENV STELLAR_ANCHOR_CONFIG=/config/anchor-config.yaml
