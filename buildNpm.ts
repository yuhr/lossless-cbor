import { build, emptyDir, EntryPoint } from "jsr:@deno/dnt"

if (!Deno.args[0]) throw new Error("Please provide a version number as the first argument.")

await emptyDir("./npm")

const entryPoints: EntryPoint[] = (await Array.fromAsync(Deno.readDir("./src")))
	.filter(entry => entry.isFile && entry.name.endsWith(".ts"))
	.map(
		entry =>
			({
				name: `./${entry.name.replace(/\.ts$/, "")}`,
				path: `./src/${entry.name}`,
			}) satisfies EntryPoint,
	)

await build({
	entryPoints: ["./src/index.ts", ...entryPoints],
	outDir: "./npm",
	shims: {},
	package: {
		name: "lossless-cbor",
		version: Deno.args[0],
		description: "A zero-dependency library to encode and decode CBOR (RFC8949) for TypeScript.",
		keywords: ["cbor", "encoding", "decoding", "serialization", "deserialization", "typescript"],
		author: "Sʜɪᴍᴜʀᴀ Yū <mail@yuhr.org>",
		license: "MPL-2.0",
		repository: {
			type: "git",
			url: "git+https://github.com/yuhr/lossless-cbor.git",
		},
		sideEffects: false,
	},
	packageManager: "pnpm",
	typeCheck: false,
	test: false,
	skipSourceOutput: true,
	esModule: true,
})

Deno.copyFileSync("./README.md", "./npm/README.md")
Deno.copyFileSync("./LICENSE", "./npm/LICENSE")

// Generate `jsr.json`
const jsrJson = {
	name: "@yuhr/lossless-cbor",
	version: Deno.args[0],
	license: "MPL-2.0",
	exports: Object.fromEntries(
		entryPoints.map(entry => [entry.name === "./index" ? "." : entry.name, entry.path]),
	),
	publish: {
		include: ["LICENSE", "README.md", "src/**/*.ts"],
		exclude: ["src/**/*.test.ts"],
	},
}
await Deno.writeTextFile("jsr.json", JSON.stringify(jsrJson, null, "\t"))