# Official Anchor Platform image plus this repo's testnet config.
# Railway rootDirectory is `anchor/` so COPY paths are relative to this folder.
# SEP-1 toml is served by the lab (HOME_DOMAIN), not this container.
FROM stellar/anchor-platform:2.11.3
COPY config /config
ENV STELLAR_ANCHOR_CONFIG=/config/anchor-config.yaml
# Official image ENTRYPOINT is `/bin/bash /app/start.sh` (runner.jar).
# Railway startCommand must be the full runner path, not `anchor-platform.jar`.
CMD ["--sep-server"]
