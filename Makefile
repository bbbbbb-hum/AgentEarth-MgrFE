install:
	npm ci

build:
	npm run build

dockerimg:
	docker build -t ae-mgr-fe:latest -f Dockerfile ./dist
