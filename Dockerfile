ARG DOCKER_REP_PATH=""
FROM ${DOCKER_REP_PATH}nginx:alpine

RUN mkdir -p /opt/xlapps/AEMGRFE/html \
  && mkdir -p /opt/xlconfigs/AEMGRFE

WORKDIR /opt/xlapps/AEMGRFE/html

COPY . /opt/xlapps/AEMGRFE/html
COPY nginx.conf /opt/xlconfigs/AEMGRFE/nginx.conf

EXPOSE 80
CMD ["nginx", "-c", "/opt/xlconfigs/AEMGRFE/nginx.conf", "-g", "daemon off;"]
