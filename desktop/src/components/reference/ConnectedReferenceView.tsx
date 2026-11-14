import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { DEFAULT_LAYOUT_OPTIONS, type ReferenceProps } from './ReferenceKioskView'
import ReferenceKioskView from './ReferenceKioskView'
import { DEFAULT_PRICE_2X6, DEFAULT_PRICE_4X6, DEFAULT_EXTRA_COPY_PRICE_2X6, DEFAULT_EXTRA_COPY_PRICE_4X6 } from '../../lib/constants'

export default function ConnectedReferenceView(props: ReferenceProps) {
    const { eventConfig, photoboothSessionEndTime, selectedLayout, selectedFrameSize, selectedCopies, session, selectedFilter } = useAppStore()
    const [now, setNow] = useState(Date.now)
    useEffect(() => {
        if (!photoboothSessionEndTime) return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [photoboothSessionEndTime])
    const layouts = DEFAULT_LAYOUT_OPTIONS.map((layout, index) => {
        const strip = index === 0
        const price = strip ? eventConfig.price2x6 || DEFAULT_PRICE_2X6 : eventConfig.price4x6 || DEFAULT_PRICE_4X6
        const copies = strip ? 2 : 1
        return { ...layout, basePrice: price, sheetsIncluded: copies, extraStep: copies,
            extraPrice: strip ? eventConfig.extraCopyPrice2x6 || DEFAULT_EXTRA_COPY_PRICE_2X6 : eventConfig.extraCopyPrice4x6 || DEFAULT_EXTRA_COPY_PRICE_4X6,
            priceLabel: new Intl.NumberFormat('vi-VN').format(price),
            confirmPriceLabel: `${new Intl.NumberFormat('vi-VN').format(price)}đ/ ${copies} tấm`,
        }
    })
    const index = selectedFrameSize === '2x6' ? 0 : selectedLayout.photosCount === 9 ? 2 : 1
    const photos = session?.photos.map(photo => photo.compositedPath || photo.enhancedPath || photo.rawPath) || []
    return <ReferenceKioskView {...props} layouts={layouts} values={{
        selectedLayoutIdx: index, printCount: selectedCopies, capturedPhotos: photos,
        selectedFilterIdx: selectedFilter.id === 'vintage_noir' ? 1 : selectedFilter.id === 'retro_90s' ? 2 : 0,
        remainingSeconds: photoboothSessionEndTime ? Math.max(0, Math.ceil((photoboothSessionEndTime - now) / 1000)) : 0,
        ...props.values,
    }} />
}
