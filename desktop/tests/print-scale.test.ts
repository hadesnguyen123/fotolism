import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    LS_PRINT_SCALE_KEY,
    DEFAULT_PRINT_SCALE,
} from '../src/lib/constants'
import {
    useAppStore,
    loadSavedPrintScale,
} from '../src/store/appStore'
import {
    preparePrintImageForDNP,
    sampleImageEdgeColor,
} from '../src/lib/canvasCompositor'

const createLocalStorageMock = () => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString()
        },
        removeItem: (key: string) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        },
    }
}

describe('Fotolism Kiosk — Print Scale Feature Suite', () => {
    let mockStorage: ReturnType<typeof createLocalStorageMock>

    beforeEach(() => {
        vi.restoreAllMocks()
        mockStorage = createLocalStorageMock()
        ;(globalThis as any).localStorage = mockStorage
        ;(globalThis as any).window = globalThis
        useAppStore.getState().setPrintScale(DEFAULT_PRINT_SCALE)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('1. Cấu hình & Lưu trữ bền vững (Persistence)', () => {
        it('mặc định trả về 100.00% (Chuẩn DNP 2478x3690) khi chưa có cấu hình lưu', () => {
            expect(DEFAULT_PRINT_SCALE).toBe(100)
            mockStorage.clear()
            expect(loadSavedPrintScale()).toBe(100)
            expect(useAppStore.getState().printScale).toBe(100)
        })

        it('tự động chuyển đổi cấu hình cũ 95.50% sang 100.00% lần đầu nâng cấp', () => {
            mockStorage.clear()
            mockStorage.setItem(LS_PRINT_SCALE_KEY, '95.5')
            expect(loadSavedPrintScale()).toBe(100)
            expect(mockStorage.getItem(LS_PRINT_SCALE_KEY)).toBe('100')
        })

        it('tự động lưu khi thay đổi và định dạng chính xác 2 chữ số thập phân (e.g. 99.75%)', () => {
            const { setPrintScale } = useAppStore.getState()
            setPrintScale(99.75)

            expect(useAppStore.getState().printScale).toBe(99.75)
            expect(mockStorage.getItem(LS_PRINT_SCALE_KEY)).toBe('99.75')
            expect(loadSavedPrintScale()).toBe(99.75)
        })

        it('hỗ trợ điều chỉnh theo bước 0.25%', () => {
            const { setPrintScale } = useAppStore.getState()

            setPrintScale(99.5)
            expect(useAppStore.getState().printScale).toBe(99.5)

            setPrintScale(99.25)
            expect(useAppStore.getState().printScale).toBe(99.25)

            setPrintScale(99.0)
            expect(useAppStore.getState().printScale).toBe(99.0)
        })

        it('giới hạn an toàn trong khoảng 90% – 100% (clamp out-of-bounds)', () => {
            const { setPrintScale } = useAppStore.getState()

            setPrintScale(105)
            expect(useAppStore.getState().printScale).toBe(100)

            setPrintScale(85)
            expect(useAppStore.getState().printScale).toBe(90)

            mockStorage.setItem(LS_PRINT_SCALE_KEY, '120')
            expect(loadSavedPrintScale()).toBe(100)

            mockStorage.setItem(LS_PRINT_SCALE_KEY, 'invalid')
            expect(loadSavedPrintScale()).toBe(100)
        })
    })

    describe('2. Print Engine Scaling (preparePrintImageForDNP)', () => {
        it('khổ 4x6 ở 100% xuất đúng canvas PR (4x6) 2478x3690 với vùng thiết kế 2376x3600 căn giữa (bleed 51px ngang, 45px dọc)', async () => {
            const mock4x6 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...'
            const createdCanvases: any[] = []
            const mainDrawCalls: any[] = []

            const mockDocument = {
                createElement: (tagName: string) => {
                    if (tagName === 'canvas') {
                        const canvasIndex = createdCanvases.length
                        const canvas = {
                            width: 0,
                            height: 0,
                            getContext: () => ({
                                fillStyle: '',
                                fillRect: () => {},
                                drawImage: (...args: any[]) => {
                                    if (canvasIndex === 0) {
                                        mainDrawCalls.push(args)
                                    }
                                },
                                getImageData: () => ({
                                    data: [255, 255, 255, 255],
                                }),
                            }),
                            toDataURL: () =>
                                'data:image/jpeg;base64,/dnp_pr_4x6_100',
                        }
                        createdCanvases.push(canvas)
                        return canvas
                    }
                    return {}
                },
            }
            const prevDoc = (globalThis as any).document
            ;(globalThis as any).document = mockDocument

            const originalImage = (globalThis as any).Image
            class MockImage {
                onload: (() => void) | null = null
                src = ''
                naturalWidth = 2400
                naturalHeight = 3616
                width = 2400
                height = 3616
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockImage

            try {
                const result = await preparePrintImageForDNP(mock4x6, 100.0)
                expect(result).toBe('data:image/jpeg;base64,/dnp_pr_4x6_100')

                const mainCanvas = createdCanvases[0]
                expect(mainCanvas.width).toBe(2478)
                expect(mainCanvas.height).toBe(3690)

                expect(mainDrawCalls).toHaveLength(1)
                expect(mainDrawCalls[0][1]).toBe(51)
                expect(mainDrawCalls[0][2]).toBe(45)
                expect(mainDrawCalls[0][3]).toBe(2376)
                expect(mainDrawCalls[0][4]).toBe(3600)
            } finally {
                ;(globalThis as any).document = prevDoc
                ;(globalThis as any).Image = originalImage
            }
        })

        it('áp dụng thu nhỏ thêm khi scale < 100% và vẫn giữ nguyên canvas 2478x3690 chuẩn driver', async () => {
            const mockSrc = 'data:image/jpeg;base64,/sample'
            const createdCanvases: any[] = []
            const mainDrawCalls: any[] = []

            const mockDocument = {
                createElement: (tagName: string) => {
                    if (tagName === 'canvas') {
                        const canvasIndex = createdCanvases.length
                        const canvas = {
                            width: 0,
                            height: 0,
                            getContext: () => ({
                                fillStyle: '',
                                fillRect: () => {},
                                drawImage: (...args: any[]) => {
                                    if (canvasIndex === 0) {
                                        mainDrawCalls.push(args)
                                    }
                                },
                                getImageData: () => ({
                                    data: [255, 255, 255, 255],
                                }),
                                save: () => {},
                                restore: () => {},
                                beginPath: () => {},
                                moveTo: () => {},
                                lineTo: () => {},
                                stroke: () => {},
                                setLineDash: () => {},
                            }),
                            toDataURL: () =>
                                'data:image/jpeg;base64,/scaled_output',
                        }
                        createdCanvases.push(canvas)
                        return canvas
                    }
                    return {}
                },
            }
            const prevDoc = (globalThis as any).document
            ;(globalThis as any).document = mockDocument

            const originalImage = (globalThis as any).Image
            class MockImage {
                onload: (() => void) | null = null
                src = ''
                naturalWidth = 2400
                naturalHeight = 3600
                width = 2400
                height = 3600
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockImage

            try {
                // Thu nhỏ thêm 99.00% so với vùng 2376x3600
                const res = await preparePrintImageForDNP(mockSrc, 99.0)
                expect(res).toBe('data:image/jpeg;base64,/scaled_output')

                const mainCanvas = createdCanvases[0]
                expect(mainCanvas.width).toBe(2478)
                expect(mainCanvas.height).toBe(3690)

                const lastDraw = mainDrawCalls[0]
                const expectedW = Math.round(2376 * 0.99)
                const expectedH = Math.round(3600 * 0.99)
                const expectedOffsetX = Math.round((2478 - expectedW) / 2)
                const expectedOffsetY = Math.round((3690 - expectedH) / 2)

                expect(lastDraw[3]).toBe(expectedW)
                expect(lastDraw[4]).toBe(expectedH)
                expect(lastDraw[1]).toBe(expectedOffsetX)
                expect(lastDraw[2]).toBe(expectedOffsetY)
            } finally {
                ;(globalThis as any).document = prevDoc
                ;(globalThis as any).Image = originalImage
            }
        })

        it('với dải đơn 2x6 (1200x3616) ở 100%, ghép 2 dải 1200x3600 sát trục cắt x=1239 trên canvas 2478x3690', async () => {
            const mockStrip = 'data:image/jpeg;base64,/strip_2x6'
            const createdCanvases: any[] = []
            const mainDrawCalls: any[] = []

            const mockDocument = {
                createElement: (tagName: string) => {
                    if (tagName === 'canvas') {
                        const canvasIndex = createdCanvases.length
                        const canvas = {
                            width: 0,
                            height: 0,
                            getContext: () => ({
                                fillStyle: '',
                                fillRect: () => {},
                                drawImage: (...args: any[]) => {
                                    // Canvas 0 là mainCanvas (2478x3690), canvas 1 là sampleCanvas
                                    if (canvasIndex === 0) {
                                        mainDrawCalls.push(args)
                                    }
                                },
                                getImageData: () => ({
                                    data: [20, 20, 20, 255],
                                }),
                                save: () => {},
                                restore: () => {},
                                beginPath: () => {},
                                moveTo: () => {},
                                lineTo: () => {},
                                stroke: () => {},
                                setLineDash: () => {},
                            }),
                            toDataURL: () =>
                                'data:image/jpeg;base64,/paired_4x6_scaled',
                        }
                        createdCanvases.push(canvas)
                        return canvas
                    }
                    return {}
                },
            }
            const prevDoc = (globalThis as any).document
            ;(globalThis as any).document = mockDocument

            const originalImage = (globalThis as any).Image
            class MockStripImage {
                onload: (() => void) | null = null
                src = ''
                naturalWidth = 1200
                naturalHeight = 3616
                width = 1200
                height = 3616
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockStripImage

            try {
                const res = await preparePrintImageForDNP(mockStrip, 100)
                expect(res).toBe('data:image/jpeg;base64,/paired_4x6_scaled')

                const mainCanvas = createdCanvases[0]
                expect(mainCanvas.width).toBe(2478)
                expect(mainCanvas.height).toBe(3690)

                // Tại 100% trên 2478x3690: mỗi dải 1188x3600; lề ngoài trái = 51, trục cắt giữa = 1239, lề trên/dưới = 45
                expect(mainDrawCalls).toHaveLength(2)
                const [leftStripCall, rightStripCall] = mainDrawCalls

                // Dải 1: x=51..1239 (1188px), y=45..3645 (3600px)
                expect(leftStripCall[1]).toBe(51)
                expect(leftStripCall[2]).toBe(45)
                expect(leftStripCall[3]).toBe(1188)
                expect(leftStripCall[4]).toBe(3600)

                // Dải 2: x=1239..2427 (1188px), y=45..3645 (3600px)
                expect(rightStripCall[1]).toBe(1239)
                expect(rightStripCall[2]).toBe(45)
                expect(rightStripCall[3]).toBe(1188)
                expect(rightStripCall[4]).toBe(3600)
            } finally {
                ;(globalThis as any).document = prevDoc
                ;(globalThis as any).Image = originalImage
            }
        })
    })

    describe('3. Màu lấp viền (sampleImageEdgeColor)', () => {
        it('trả về chuỗi định dạng màu RGB hợp lệ', () => {
            const mockDocument = {
                createElement: (tagName: string) => {
                    if (tagName === 'canvas') {
                        return {
                            width: 0,
                            height: 0,
                            getContext: () => ({
                                drawImage: () => {},
                                getImageData: () => ({
                                    data: [245, 240, 230, 255],
                                }),
                            }),
                        }
                    }
                    return {}
                },
            }
            const prevDoc = (globalThis as any).document
            ;(globalThis as any).document = mockDocument

            try {
                const color = sampleImageEdgeColor({} as any)
                expect(color).toBe('rgb(245, 240, 230)')
            } finally {
                ;(globalThis as any).document = prevDoc
            }
        })
    })
})
