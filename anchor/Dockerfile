# Official Anchor Platform image plus this repo's testnet config.
# Railway rootDirectory is `anchor/` so COPY paths are relative to this folder.
# SEP-1 toml is served by the lab (HOME_DOMAIN), not this container.
FROM stellar/anchor-platform:4.8.0
COPY config /config
ENV STELLAR_ANCHOR_CONFIG=/config/anchor-config.yaml

# Hikari's floor of 5 open Postgres connections keeps this process awake.
# Railway Serverless only sleeps a service that goes quiet on the network.
ADD https://repo1.maven.org/maven2/org/javassist/javassist/3.30.2-GA/javassist-3.30.2-GA.jar /tmp/javassist.jar
COPY idle-pool-agent/IdlePoolAgent.java /tmp/IdlePoolAgent.java
RUN javac -cp /tmp/javassist.jar -d /tmp/idle-pool-classes /tmp/IdlePoolAgent.java \
 && printf 'Premain-Class: IdlePoolAgent\n' > /tmp/idle-pool-manifest.mf \
 && mkdir -p /tmp/idle-pool-jar \
 && (cd /tmp/idle-pool-jar && jar xf /tmp/javassist.jar && rm -rf META-INF) \
 && cp /tmp/idle-pool-classes/*.class /tmp/idle-pool-jar/ \
 && jar cfm /app/idle-pool-agent.jar /tmp/idle-pool-manifest.mf -C /tmp/idle-pool-jar . \
 && rm -rf /tmp/javassist.jar /tmp/idle-pool-classes /tmp/idle-pool-jar /tmp/IdlePoolAgent.java /tmp/idle-pool-manifest.mf
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/idle-pool-agent.jar"

# Official image ENTRYPOINT is `/bin/bash /app/start.sh` (runner.jar).
# Railway startCommand must be the full runner path, not `anchor-platform.jar`.
CMD ["--sep-server", "--platform-server"]
