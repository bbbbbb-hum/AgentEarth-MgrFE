ARG DOCKER_REP_PATH=""
FROM ${DOCKER_REP_PATH}ubuntu:22.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nginx \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /opt/xlapps/AEMgrFE/html

COPY . /opt/xlapps/AEMgrFE/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
