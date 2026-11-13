import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.korean_beauty_engine import KoreanBeautyEngine,KoreanBeautyConfig
class UpperLipTests(unittest.TestCase):
 def test_lift_is_bounded_and_preserves_lip_pigment_and_outside(self):
  lab=np.full((200,200,3),[185,138,138],np.float32)
  lab[95:125,75:125,0]=165
  lab[120:140,75:125]=[150,170,145]
  source=lab.copy();before=lab.copy();skin=np.ones((200,200),np.float32)
  face={'landmarks':np.array([[70,50],[130,50],[100,80],[70,140],[130,140]])}
  lift=KoreanBeautyEngine().soften_upper_lip_shadow(lab,source,[face],skin,.9)
  self.assertGreater(float(lift.max()),0)
  self.assertLessEqual(float(lift.max()),14*.9+.001)
  np.testing.assert_array_equal(lab[...,1:],before[...,1:])
  np.testing.assert_array_equal(lab[120:140,75:125],before[120:140,75:125])
  np.testing.assert_array_equal(lab[:70],before[:70])
 def test_missing_reference_skips_processing(self):
  lab=np.full((200,200,3),[160,138,138],np.float32);before=lab.copy()
  face={'landmarks':np.array([[70,50],[130,50],[100,80],[70,140],[130,140]])}
  KoreanBeautyEngine().soften_upper_lip_shadow(lab,before,[face],np.zeros((200,200),np.float32),.9)
  np.testing.assert_array_equal(lab,before)
 def test_three_strong_passes_do_not_exceed_adjacent_skin(self):
  cfg=KoreanBeautyConfig.white_pink()
  self.assertEqual(cfg.upperLipPasses,3)
  self.assertEqual(cfg.upperLipStrength,2.7)
  lab=np.full((200,200,3),[185,138,138],np.float32)
  lab[95:125,75:125,0]=150
  lab[120:140,75:125]=[150,170,145]
  source=lab.copy();skin=np.ones((200,200),np.float32)
  face={'landmarks':np.array([[70,50],[130,50],[100,80],[70,140],[130,140]])}
  engine=KoreanBeautyEngine()
  for _ in range(cfg.upperLipPasses):
   engine.soften_upper_lip_shadow(lab,source,[face],skin,cfg.upperLipStrength)
   self.assertLessEqual(float(lab[...,0].max()),185.)
  self.assertGreater(float(lab[110,100,0]),150.)
  np.testing.assert_array_equal(lab[...,1:],source[...,1:])
  np.testing.assert_array_equal(lab[120:140,75:125],source[120:140,75:125])
if __name__=='__main__':unittest.main()
