import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.korean_beauty_engine import KoreanBeautyEngine, KoreanBeautyConfig


class ToneContinuityTests(unittest.TestCase):
    def setUp(self):
        self.engine=KoreanBeautyEngine()
        lab=np.full((240,240,3),[180,140,140],np.uint8)
        self.source=cv2.cvtColor(lab,cv2.COLOR_LAB2BGR)
        self.before=cv2.cvtColor(self.source,cv2.COLOR_BGR2LAB).astype(np.float32)
        self.after=self.before.copy()
        self.after[20:140,40:140]+=[12,6,-4]
        self.skin=np.zeros((240,240),np.float32)
        self.skin[20:140,40:140]=1
        self.faces=[{'box':np.array([40,20,100,120])}]

    def test_gradual_correction_is_stronger_at_jaw_and_leaves_neck(self):
        upper=self.after[60,90].copy()
        neck=self.after[150:].copy()
        self.engine.harmonize_face_tone(self.before,self.after,self.source,self.faces,self.skin)
        self.assertLess(self.after[60,90,0],upper[0])
        self.assertGreater(self.after[60,90,0],self.before[60,90,0])
        self.assertLess(self.after[138,90,0],self.after[60,90,0])
        np.testing.assert_array_equal(self.after[150:],neck)
        self.assertLess(self.after[138,90,0]-self.before[138,90,0],5)
        self.assertLess(self.after[138,90,1]-self.before[138,90,1],2)
        self.assertGreaterEqual(self.after[138,90,0],self.before[138,90,0])

    def test_neck_covered_by_dark_clothing_is_ignored(self):
        self.source[145:200]=[10,10,10]
        expected=self.after.copy()
        self.engine.harmonize_face_tone(self.before,self.after,self.source,self.faces,self.skin)
        np.testing.assert_array_equal(self.after,expected)

    def test_protected_pixels_are_unchanged(self):
        self.skin[120:140,85:95]=0
        expected=self.after[120:140,85:95].copy()
        self.engine.harmonize_face_tone(self.before,self.after,self.source,self.faces,self.skin)
        np.testing.assert_array_equal(self.after[120:140,85:95],expected)

    def test_overlapping_face_boxes_do_not_double_correction(self):
        once=self.after.copy();twice=self.after.copy()
        self.engine.harmonize_face_tone(self.before,once,self.source,self.faces,self.skin)
        self.engine.harmonize_face_tone(self.before,twice,self.source,self.faces*2,self.skin)
        np.testing.assert_array_equal(once,twice)

    def test_requested_white_pink_values(self):
        cfg=KoreanBeautyConfig.white_pink()
        self.assertEqual(cfg.skinSmoothing,1.0)
        self.assertEqual(cfg.skinBrightening,.55)
        self.assertEqual(cfg.skinTextureRetention,.60)
        self.assertEqual(cfg.blemishRemoval,.90)
        self.assertEqual(cfg.skinEvening,.50)
        self.assertEqual(cfg.rosyTone,.60)
        self.assertEqual(cfg.rosyBlush,.65)
        self.assertEqual(cfg.lipEnhancement,.40)
        self.assertEqual(cfg.lipGloss,.60)


if __name__=='__main__': unittest.main()
