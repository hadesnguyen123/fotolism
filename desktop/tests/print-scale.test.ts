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
        it('mặc định trả về 95.50% (Chuẩn DNP) khi chưa có cấu hình lưu', () => {
            expect(DEFAULT_PRINT_SCALE).toBe(95.5)
            mockStorage.clear()
            expect(loadSavedPrintScale()).toBe(95.5)
            expect(useAppStore.getState().printScale).toBe(95.5)
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
            expect(loadSavedPrintScale()).toBe(95.5)

            mockStorage.setItem(LS_PRINT_SCALE_KEY, 'invalid')
            expect(loadSavedPrintScale()).toBe(95.5)
        })
    })

    describe('2. Print Engine Scaling (preparePrintImageForDNP)', () => {
        it('100% giữ nguyên chính xác hành vi in hiện tại', async () => {
            const mock4x6 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...'
            
            const originalImage = (globalThis as any).Image
            class MockImage {
                onload: (() => void) | null = null
                src = ''
                naturalWidth = 1200
                naturalHeight = 1800
                width = 1200
                height = 1800
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockImage

            try {
                const result = await preparePrintImageForDNP(mock4x6, 100.0)
                expect(result).toBe(mock4x6)
            } finally {
                ;(globalThis as any).Image = originalImage
            }
        })

        it('áp dụng thu nhỏ nội dung đồng đều, căn giữa và giữ nguyên kích thước canvas', async () => {
            const mockSrc = 'data:image/jpeg;base64,/sample'
            const createdCanvases: any[] = []
            const drawnImageParams: any[] = []

            const mockDocument = {
                createElement: (tagName: string) => {
                    if (tagName === 'canvas') {
                        const canvas = {
                            width: 0,
                            height: 0,
                            getContext: () => ({
                                fillStyle: '',
                                fillRect: () => {},
                                drawImage: (...args: any[]) => {
                                    drawnImageParams.push(args)
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
                naturalWidth = 1240
                naturalHeight = 1844
                width = 1240
                height = 1844
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockImage

            try {
                // Thu nhỏ 99.75%
                const res = await preparePrintImageForDNP(mockSrc, 99.75)
                expect(res).toBe('data:image/jpeg;base64,/scaled_output')

                // Giữ nguyên kích thước canvas gốc (1240 x 1844) ở canvas đầu ra chính
                const mainCanvas = createdCanvases[0]
                expect(mainCanvas.width).toBe(1240)
                expect(mainCanvas.height).toBe(1844)

                // Căn giữa theo cả 2 chiều và không biến dạng
                const lastDraw = drawnImageParams[drawnImageParams.length - 1]
                const expectedW = Math.round(1240 * 0.9975)
                const expectedH = Math.round(1844 * 0.9975)
                const expectedOffsetX = Math.round((1240 - expectedW) / 2)
                const expectedOffsetY = Math.round((1844 - expectedH) / 2)

                expect(lastDraw[3]).toBe(expectedW)
                expect(lastDraw[4]).toBe(expectedH)
                expect(lastDraw[1]).toBe(expectedOffsetX)
                expect(lastDraw[2]).toBe(expectedOffsetY)
            } finally {
                ;(globalThis as any).document = prevDoc
                ;(globalThis as any).Image = originalImage
            }
        })

        it('với dải đơn 2x6 (600x1800), ghép 2 dải sát trục giữa x=600 trước rồi mới scale 95.50% cả khối 4x6', async () => {
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
                                    // Canvas 0 là mainCanvas (1200x1800), canvas 1 là sampleCanvas
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
                naturalWidth = 600
                naturalHeight = 1800
                width = 600
                height = 1800
                constructor() {
                    setTimeout(() => {
                        if (this.onload) this.onload()
                    }, 0)
                }
            }
            ;(globalThis as any).Image = MockStripImage

            try {
                const res = await preparePrintImageForDNP(mockStrip, 95.5)
                expect(res).toBe('data:image/jpeg;base64,/paired_4x6_scaled')

                const mainCanvas = createdCanvases[0]
                expect(mainCanvas.width).toBe(1200)
                expect(mainCanvas.height).toBe(1800)

                // Tại 95.5%: mỗi dải rộng 573, cao 1719; lề ngoài trái = 27, trục cắt giữa = 600, lề trên = 41
                expect(mainDrawCalls).toHaveLength(2)
                const [leftStripCall, rightStripCall] = mainDrawCalls

                // Dải 1: x=27..600 (573px), y=41..1760 (1719px)
                expect(leftStripCall[1]).toBe(27)
                expect(leftStripCall[2]).toBe(41)
                expect(leftStripCall[3]).toBe(573)
                expect(leftStripCall[4]).toBe(1719)

                // Dải 2: x=600..1173 (573px), y=41..1760 (1719px)
                expect(rightStripCall[1]).toBe(600)
                expect(rightStripCall[2]).toBe(41)
                expect(rightStripCall[3]).toBe(573)
                expect(rightStripCall[4]).toBe(1719)
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
