ARG DOCKER_REP_PATH=""
FROM ${DOCKER_REP_PATH}ubuntu:22.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nginx \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN rm -f /etc/nginx/sites-enabled/default

RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /var/www/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

COPY . /var/www/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
