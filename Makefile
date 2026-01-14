install:
	npm ci

build:
	npm run build
	cp nginx.conf dist/nginx.conf

dockerimg:
	docker build -t ae-mgr-fe:latest -f Dockerfile ./dist
