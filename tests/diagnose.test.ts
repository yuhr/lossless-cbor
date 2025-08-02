// SPDX-License-Identifier: CC0-1.0

import diagnose from ".../diagnose.ts"
import fromBytes from ".../fromBytes.ts"
import toBytes from ".../toBytes.ts"
import { assertEquals } from "@std/assert"
import { decodeHex, encodeHex } from "@std/encoding"
import { parse } from "@std/yaml"

const table = parse(await Deno.readTextFile(new URL(import.meta.resolve("./diagnose.yaml")))) as {
	[diagnostic: string]: string
}[]

Deno.test("`diagnose`", async ({ step }) => {
	for (const pair of table) {
		const [entry] = Object.entries(pair)
		const [diagnostic, encoded] = entry!
		const decoded = await fromBytes(decodeHex(encoded), { allowEmpty: false })
		const encodedRoundtrip = encodeHex(await toBytes(decoded))
		const diagnosticRoundtrip = await diagnose(decoded, {
			asciiSafe: true,
			encodingIndicator: { indefinite: true },
		})
		await step(`${diagnosticRoundtrip} === ${diagnostic}`, async () => {
			assertEquals(diagnosticRoundtrip, diagnostic)
		})
		await step(`└── ${encodedRoundtrip} === ${encoded} (${diagnostic})`, async () => {
			assertEquals(encodedRoundtrip, encoded)
		})
	}
})