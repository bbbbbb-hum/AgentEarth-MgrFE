# 使用阿里云官方镜像，确保流水线 100% 能拉取到
ARG DOCKER_REP_PATH=
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ARG DOCKER_REP_PATH=
FROM ${DOCKER_REP_PATH}nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
