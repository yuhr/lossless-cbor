// SPDX-License-Identifier: MPL-2.0

import type ByteSource from "../ByteSource.ts"

class ByteStream {
	#queue = new Queue<ByteSource>()
	#sources: ByteSource[]
	#chunk: Uint8Array = new Uint8Array(0)

	get isTerminated(): boolean {
		return this.#queue.closed
	}

	get isEmpty(): boolean {
		return !this.#chunk.length && !this.#sources.length && !this.#queue.length
	}

	terminate = (reason?: unknown | undefined): ByteStream => {
		this.#queue.close(reason ?? new Error("End of stream reached."))
		return this as this & { readonly terminated: true }
	}

	write = (...sources: ByteSource[]): this => {
		this.#queue.provide(...sources)
		return this
	}

	read = async (length: number): Promise<Uint8Array<ArrayBuffer> | undefined> => {
		const buffer = new ArrayBuffer(length)
		let required = new Uint8Array(buffer, 0, length)
		if (length === 0) return required
		else if (length < 0) throw new Error("Negative length is invalid.")
		else {
			let bytesWritten: number = 0
			while (this.#chunk.byteLength < required.byteLength) {
				required.set(this.#chunk)
				bytesWritten += this.#chunk.byteLength
				required = required.subarray(this.#chunk.byteLength)
				this.#chunk = new Uint8Array(0)
				if (this.#sources.length === 0) {
					try {
						this.#sources.push(this.#queue.consume())
					} catch (error) {
						if (bytesWritten !== 0) this.#sources.unshift(new Uint8Array(buffer, 0, bytesWritten))
						return undefined
					}
				}
				const source = this.#sources[0]!
				if (source instanceof Promise) {
					// @ts-expect-error: flattening nested promises
					this.#sources[0] = await source
				} else if (source instanceof ReadableStream) {
					try {
						const reader = source.getReader({ mode: "byob" })
						try {
							const { value, done } = await reader.read(new Uint8Array(required.length))
							if (done || value.length < required.length) this.#sources.shift()
							if (value) this.#chunk = value
						} finally {
							reader.releaseLock()
						}
					} catch (error) {
						const reader = source.getReader()
						try {
							const { value, done } = await reader.read()
							if (done) this.#sources.shift()
							if (value) this.#sources.unshift(value)
						} finally {
							reader.releaseLock()
						}
					}
				} else if (source instanceof Blob) {
					this.#sources[0] = source.stream()
				} else if (ArrayBuffer.isView(source)) {
					this.#sources.shift()
					this.#chunk = new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
				} else if (source instanceof ArrayBuffer) {
					this.#sources.shift()
					this.#chunk = new Uint8Array(source)
				} else if (Symbol.asyncIterator in source) {
					this.#sources[0] = source[Symbol.asyncIterator]()
					const { value, done } = await this.#sources[0].next()
					if (done) this.#sources.shift()
					if (value) this.#sources.unshift(value)
				} else if (Symbol.iterator in source) {
					this.#sources[0] = source[Symbol.iterator]()
					const { value, done } = this.#sources[0].next()
					if (done) this.#sources.shift()
					if (value) this.#sources.unshift(value)
				} else {
					const { value, done } = await source.next()
					if (done) this.#sources.shift()
					if (value) this.#sources.unshift(value)
				}
			}
			required.set(this.#chunk.subarray(0, required.byteLength))
			bytesWritten += required.byteLength
			this.#chunk = this.#chunk.subarray(required.byteLength)
			return new Uint8Array(buffer, 0, length)
		}
	}

	constructor(...sources: ByteSource[]) {
		this.#sources = sources
	}
}

class Queue<T> {
	#consumers: Pick<PromiseWithResolvers<T>, "resolve" | "reject">[] = []
	#providers: Promise<T>[] = []
	#closed: boolean = false
	#reason: unknown | undefined = undefined

	get closed(): boolean {
		return this.#closed
	}

	get reason(): unknown | undefined {
		return this.#reason
	}

	get length(): number {
		return this.#providers.length - this.#consumers.length
	}

	provide = (...values: T[]): void => {
		if (this.closed) throw this.reason
		for (const value of values) {
			const consumer = this.#consumers.shift()
			if (consumer) consumer.resolve(value)
			else this.#providers.push(Promise.resolve(value))
		}
	}

	consume = (): Promise<T> => {
		const provider = this.#providers.shift()
		if (provider) return provider
		else {
			if (this.closed) throw this.reason
			const { promise, resolve, reject } = Promise.withResolvers<T>()
			this.#consumers.push({ resolve, reject })
			return promise
		}
	}

	close = (reason?: unknown | undefined): void => {
		this.#closed = true
		this.#reason ??= reason ?? new Error("Queue has been closed.")
		for (const { reject } of this.#consumers) reject(this.#reason)
	}
}

export {
	/**
	 * @internal
	 * @private
	 * @deprecated
	 */
	ByteStream,
}