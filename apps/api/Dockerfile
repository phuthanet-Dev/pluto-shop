# syntax=docker/dockerfile:1.7

FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml ./
RUN mvn -B -ntp dependency:go-offline

COPY src src
RUN mvn -B -ntp -Dmaven.test.skip=true package

FROM eclipse-temurin:17-jre-jammy AS runtime

RUN groupadd --gid 10001 plutoshop \
    && useradd --uid 10001 --gid 10001 --home-dir /opt/app \
       --no-create-home --shell /usr/sbin/nologin plutoshop

WORKDIR /opt/app
COPY --from=build --chown=0:10001 --chmod=0440 \
    /workspace/target/plutoshop-api-0.1.0-SNAPSHOT.jar /opt/app/app.jar
COPY --from=build --chown=0:10001 --chmod=0440 \
    /workspace/target/classes/com/plutoshop/api/ContainerHealthCheck.class \
    /opt/app/healthcheck/com/plutoshop/api/ContainerHealthCheck.class
RUN chmod 0550 \
    /opt/app/healthcheck \
    /opt/app/healthcheck/com \
    /opt/app/healthcheck/com/plutoshop \
    /opt/app/healthcheck/com/plutoshop/api \
    && mkdir -p /var/lib/plutoshop/product-media \
    && chown 10001:10001 /var/lib/plutoshop/product-media \
    && chmod 0750 /var/lib/plutoshop/product-media

USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["java", "-cp", "/opt/app/healthcheck", "com.plutoshop.api.ContainerHealthCheck"]

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+ExitOnOutOfMemoryError", "-jar", "/opt/app/app.jar"]
