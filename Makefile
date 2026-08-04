.PHONY: dev build typecheck clean format deploy

dev:
	pnpm dev

build:
	pnpm build

typecheck:
	tsc --noEmit

clean:
	rm -rf .output dist

format:
	pnpm lint

deploy: build
	rsync -r --delete .output/ jiracule:/
