ARG DOCKER_REP_PATH=""
FROM ${DOCKER_REP_PATH}ubuntu:22.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nginx \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/xlapps/AEMGRFE/html \
  && mkdir -p /opt/xlconfigs/AEMGRFE

WORKDIR /opt/xlapps/AEMGRFE/html

COPY . /opt/xlapps/AEMGRFE/html
COPY nginx.conf /opt/xlconfigs/AEMGRFE/nginx.conf

EXPOSE 80
CMD ["nginx", "-c", "/opt/xlconfigs/AEMGRFE/nginx.conf", "-g", "daemon off;"]
