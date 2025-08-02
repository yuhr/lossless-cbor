@_:
	just --list

setup:
	chmod +x .githooks/*
	git config --local core.hooksPath .githooks
	corepack enable
	pnpm install

test *ARGS:
	deno test --config tests/deno.json --allow-read {{ARGS}}