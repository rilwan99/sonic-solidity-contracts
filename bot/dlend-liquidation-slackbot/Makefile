.PHONY: lint install docker-build docker-run docker-shell

install:
	yarn install --frozen-lockfile

lint:
	yarn run lint || echo "No linter configured."

docker-build:
	docker build -t dlend-liquidation-slackbot .

docker-run:
	docker run --rm dlend-liquidation-slackbot

docker-shell:
	docker run --rm -it dlend-liquidation-slackbot sh 