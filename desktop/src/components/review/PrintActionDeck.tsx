import React from 'react'
import { Printer, Loader2 } from 'lucide-react'
import type { FrameSize } from '../../store/appStore'

interface PrintActionDeckProps {
    selectedFrameSize: FrameSize
    paidCopies?: number
    hasPrinted?: boolean
    isPrinting: boolean
    isGeneratingComposite: boolean
    printCopies: number
    printError: string | null
    onSetPrintCopies: React.Dispatch<React.SetStateAction<number>>
    onPrint: () => void
}

export const PrintActionDeck: React.FC<PrintActionDeckProps> = ({
    selectedFrameSize,
    paidCopies,
    hasPrinted,
    isPrinting,
    isGeneratingComposite,
    printCopies,
    printError,
    onSetPrintCopies,
    onPrint,
}) => {
    return (
        <div className="delivery-card-pastel">
            <div className="card-title-pastel">
                <Printer
                    size={20}
                    strokeWidth={2.2}
                    color="var(--brand-primary, #502A1D)"
                />
                <span>In ảnh</span>
            </div>

            <div className="print-copies-row">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Số bản in:
                    </span>
                    {paidCopies && (
                        <span
                            style={{
                                fontSize: '0.76rem',
                                color: '#059669',
                                fontWeight: 600,
                            }}
                        >
                            Đã thanh toán: {paidCopies}{' '}
                            {selectedFrameSize === '2x6' ? 'dải' : 'tấm'}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                        className="copies-btn-pastel"
                        aria-label="Giảm số bản in"
                        onClick={() => {
                            const step = selectedFrameSize === '2x6' ? 2 : 1
                            const min = selectedFrameSize === '2x6' ? 2 : 1
                            onSetPrintCopies((c) => Math.max(min, c - step))
                        }}
                        disabled={
                            Boolean(hasPrinted) ||
                            isPrinting ||
                            printCopies <= (selectedFrameSize === '2x6' ? 2 : 1)
                        }
                    >
                        -
                    </button>
                    <span
                        style={{
                            fontWeight: 900,
                            fontSize: '1.2rem',
                            color: 'var(--color-pink-primary)',
                        }}
                    >
                        {printCopies}{' '}
                        {selectedFrameSize === '2x6' ? 'dải' : 'tấm'}
                    </span>
                    <button
                        className="copies-btn-pastel"
                        aria-label="Tăng số bản in"
                        onClick={() => {
                            const step = selectedFrameSize === '2x6' ? 2 : 1
                            onSetPrintCopies((c) => Math.min(12, c + step))
                        }}
                        disabled={
                            Boolean(hasPrinted) ||
                            isPrinting ||
                            printCopies >= 12
                        }
                    >
                        +
                    </button>
                </div>
            </div>

            <button
                className="print-btn-pastel"
                id="print-button"
                disabled={
                    Boolean(hasPrinted) || isPrinting || isGeneratingComposite
                }
                onClick={onPrint}
            >
                {isPrinting ? (
                    <>
                        <Loader2 size={20} className="animate-spin" />
                        Đang in ảnh...
                    </>
                ) : hasPrinted ? (
                    'Đã in ảnh'
                ) : printError ? (
                    'Thử in lại'
                ) : (
                    'In ảnh'
                )}
            </button>
            {printError && (
                <p
                    style={{
                        color: '#EF4444',
                        fontSize: '0.85rem',
                        marginTop: '8px',
                        textAlign: 'center',
                        fontWeight: 600,
                    }}
                >
                    {printError}
                </p>
            )}
        </div>
    )
}
