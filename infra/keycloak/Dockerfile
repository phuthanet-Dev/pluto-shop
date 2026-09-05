# syntax=docker/dockerfile:1.7

FROM quay.io/keycloak/keycloak:26.4.0 AS builder

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true

RUN /opt/keycloak/bin/kc.sh build --db=postgres

FROM quay.io/keycloak/keycloak:26.4.0

COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY themes /opt/keycloak/themes

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
