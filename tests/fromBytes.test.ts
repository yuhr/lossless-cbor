// SPDX-License-Identifier: CC0-1.0

import fromBytes from ".../fromBytes.ts"
import fromValue from ".../fromValue.ts"
import toBytes from ".../toBytes.ts"
import toValue from ".../toValue.ts"
import { assertEquals, assertRejects } from "@std/assert"

Deno.test("`fromBytes`", async ({ step }) => {
	await step("types", async ({ step }) => {
		const one = Uint8Array.of(1)

		const allowEmptyBooleanOrUndefined = true as boolean | undefined
		const allowEmptyTrueOrUndefined = true as true | undefined
		const allowEmptyFalseOrUndefined = true as false | undefined
		const allowEmptyBoolean = true as boolean
		const allowEmptyTrue = true as const
		const allowEmptyFalse = false as const
		const allowEmptyUndefined = undefined as undefined

		const resultAllowEmptyBooleanOrUndefined = fromBytes(one, {
			allowEmpty: allowEmptyBooleanOrUndefined,
		})
		const resultAllowEmptyTrueOrUndefined = fromBytes(one, {
			allowEmpty: allowEmptyTrueOrUndefined,
		})
		const resultAllowEmptyFalseOrUndefined = fromBytes(one, {
			allowEmpty: allowEmptyFalseOrUndefined,
		})
		const resultAllowEmptyBoolean = fromBytes(one, { allowEmpty: allowEmptyBoolean })
		const resultAllowEmptyTrue = fromBytes(one, { allowEmpty: allowEmptyTrue })
		const resultAllowEmptyFalse = fromBytes(one, { allowEmpty: allowEmptyFalse })
		const resultAllowEmptyUndefined = fromBytes(one, { allowEmpty: allowEmptyUndefined })

		await step("`allowEmpty: boolean | undefined`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyBooleanOrUndefined
			shouldAssignable = resultAllowEmptyTrueOrUndefined
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			shouldAssignable = resultAllowEmptyBoolean
			shouldAssignable = resultAllowEmptyTrue
			shouldAssignable = resultAllowEmptyFalse
			shouldAssignable = resultAllowEmptyUndefined
		})

		await step("`allowEmpty: true | undefined`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyTrueOrUndefined
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			shouldAssignable = resultAllowEmptyBoolean
			shouldAssignable = resultAllowEmptyTrue
			shouldAssignable = resultAllowEmptyFalse
			shouldAssignable = resultAllowEmptyUndefined
		})

		await step("`allowEmpty: false | undefined`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyFalseOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrueOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBoolean
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrue
			shouldAssignable = resultAllowEmptyFalse
			shouldAssignable = resultAllowEmptyUndefined
		})

		await step("`allowEmpty: boolean`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyBoolean
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			shouldAssignable = resultAllowEmptyBoolean
			shouldAssignable = resultAllowEmptyTrue
			shouldAssignable = resultAllowEmptyFalse
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyUndefined
		})

		await step("`allowEmpty: true`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyTrue
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrueOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			shouldAssignable = resultAllowEmptyBoolean
			shouldAssignable = resultAllowEmptyFalse
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyUndefined
		})

		await step("`allowEmpty: false`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyFalse
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrueOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrue
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBoolean
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyUndefined
		})
		await step("`allowEmpty: undefined`", async ({ step }) => {
			let shouldAssignable: typeof resultAllowEmptyUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBooleanOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrueOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyFalseOrUndefined
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyTrue
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyFalse
			// @ts-expect-error: should fail
			shouldAssignable = resultAllowEmptyBoolean
		})
	})
	await step("empty (`allowEmpty: false`)", async ({ step }) => {
		const empty = new Uint8Array(0)
		await assertRejects(
			async () => await fromBytes(empty, { allowEmpty: false }),
			"Unexpected end of input.",
		)
	})
	await step("empty (`allowEmpty: true`)", async ({ step }) => {
		const empty = new Uint8Array(0)
		assertEquals(await fromBytes(empty, { allowEmpty: true }), undefined)
	})
	await step("single (`allowEmpty: false`)", async ({ step }) => {
		const single = Uint8Array.of(23)
		assertEquals(await fromBytes(single, { allowEmpty: false }), await fromValue(23n))
	})
	await step("iterate", async ({ step }) => {
		const stream = await Promise.all(
			[42n, 24n].map(async value => await toBytes(await fromValue(value))),
		)
		assertEquals(
			await Promise.all(
				(await Array.fromAsync(fromBytes(stream))).map(async dataItem => await toValue(dataItem)),
			),
			[42n, 24n],
		)
	})
	await step("iterate (`allowEmpty: undefined`)", async ({ step }) => {
		const stream = await Promise.all(
			[42n, 24n].map(async value => await toBytes(await fromValue(value))),
		)
		assertEquals(
			await Promise.all(
				(await Array.fromAsync(fromBytes(stream, { allowEmpty: undefined }))).map(
					async dataItem => await toValue(dataItem),
				),
			),
			[42n, 24n],
		)
	})
})