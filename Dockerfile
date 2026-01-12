ARG DOCKER_REP_PATH=
FROM ${DOCKER_REP_PATH}node:20-alpine AS build
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
