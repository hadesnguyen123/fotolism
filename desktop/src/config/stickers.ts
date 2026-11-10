export type StickerCategory = 'Heart' | 'Emoji' | 'Cute' | 'Event' | 'Styles'

export interface StickerOption {
    id: string
    category: StickerCategory
    icon: string
    label: string
}

export const STICKER_LIBRARY: StickerOption[] = [
    // Heart
    { id: 'st_heart_pink', category: 'Heart', icon: '💖', label: 'Lấp lánh' },
    {
        id: 'st_heart_sparkle',
        category: 'Heart',
        icon: '💕',
        label: 'Trái tim đôi',
    },
    { id: 'st_heart_love', category: 'Heart', icon: '❤️', label: 'Tình yêu' },
    { id: 'st_heart_ribbon', category: 'Heart', icon: '💝', label: 'Hộp quà' },
    {
        id: 'st_heart_growing',
        category: 'Heart',
        icon: '💗',
        label: 'Rộn ràng',
    },

    // Cute
    { id: 'st_cute_bunny', category: 'Cute', icon: '🐰', label: 'Thỏ con' },
    { id: 'st_cute_cat', category: 'Cute', icon: '🐱', label: 'Mèo cưng' },
    {
        id: 'st_cute_butterfly',
        category: 'Cute',
        icon: '🦋',
        label: 'Bướm tím',
    },
    { id: 'st_cute_mushroom', category: 'Cute', icon: '🍄', label: 'Nấm đỏ' },
    { id: 'st_cute_rainbow', category: 'Cute', icon: '🌈', label: 'Cầu vồng' },
    { id: 'st_cute_chick', category: 'Cute', icon: '🐤', label: 'Gà con' },

    // Emoji
    { id: 'st_emoji_wink', category: 'Emoji', icon: '😉', label: 'Nháy mắt' },
    { id: 'st_emoji_stars', category: 'Emoji', icon: '🤩', label: 'Mắt sao' },
    { id: 'st_emoji_kiss', category: 'Emoji', icon: '😘', label: 'Thổi hôn' },
    { id: 'st_emoji_cool', category: 'Emoji', icon: '😎', label: 'Ngầu lòi' },

    // Event
    { id: 'st_event_cake', category: 'Event', icon: '🎂', label: 'Bánh kem' },
    {
        id: 'st_event_balloon',
        category: 'Event',
        icon: '🎈',
        label: 'Bóng bay',
    },
    { id: 'st_event_cheers', category: 'Event', icon: '🥂', label: 'Nâng ly' },
    {
        id: 'st_event_flower',
        category: 'Event',
        icon: '🌸',
        label: 'Hoa anh đào',
    },
    { id: 'st_event_sun', category: 'Event', icon: '☀️', label: 'Mặt trời' },

    // Styles
    {
        id: 'st_style_crown',
        category: 'Styles',
        icon: '👑',
        label: 'Vương miện',
    },
    {
        id: 'st_style_glasses',
        category: 'Styles',
        icon: '🕶️',
        label: 'Kính râm',
    },
    {
        id: 'st_style_bandaid',
        category: 'Styles',
        icon: '🩹',
        label: 'Băng cá nhân',
    },
    {
        id: 'st_style_sparkle',
        category: 'Styles',
        icon: '✨',
        label: 'Ánh sao',
    },
    {
        id: 'st_style_fries',
        category: 'Styles',
        icon: '🍟',
        label: 'Khoai tây chiên',
    },
]

export interface PlacedSticker {
    id: string
    icon: string
    x: number // percent 0 - 100
    y: number // percent 0 - 100
    scale: number
    rotation: number
}
