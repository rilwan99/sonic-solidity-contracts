.PHONY: lint install docker-build docker-run docker-shell

install:
	yarn install --frozen-lockfile

lint:
	yarn lint

docker-build:
	docker build -t swapx-peg-bot .

docker-run:
	docker run --rm swapx-peg-bot

docker-shell:
	docker run --rm -it swapx-peg-bot sh 