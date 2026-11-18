"""White balance from a measured neutral reference, independent of scene colours."""
import cv2
import numpy as np

def balance_from_reference(image_bgr, reference_rgb, strength=0.0):
    if strength <= 0 or reference_rgb is None:
        return image_bgr
    reference = np.asarray(reference_rgb, dtype=np.float32)
    if reference.shape != (3,) or not np.all(np.isfinite(reference)) or np.any(reference < 16) or np.any(reference > 250):
        raise ValueError('Neutral reference must contain three unclipped RGB values in [16, 250]')
    # Bounded, exposure-neutral gains; darken highlights rather than clip a channel.
    gains = np.clip(reference.mean() / reference, 0.8, 1.2)
    gains = 1.0 + (gains - 1.0) * float(np.clip(strength, 0.0, 1.0))
    gains = gains[::-1]
    pixels = image_bgr.astype(np.float32)
    corrected = pixels * gains
    peak = np.max(corrected, axis=2, keepdims=True)
    corrected *= np.minimum(1.0, 255.0 / np.maximum(peak, 1.0))
    return np.rint(np.clip(corrected, 0, 255)).astype(np.uint8)
