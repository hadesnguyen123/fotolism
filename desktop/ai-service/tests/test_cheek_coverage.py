import sys,unittest
from pathlib import Path
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.korean_beauty_engine import KoreanBeautyEngine
class CheekCoverageTests(unittest.TestCase):
 def test_connected_cheek_extends_beyond_old_oval_without_background(self):
  img=np.full((300,300,3),[25,55,20],np.uint8)
  img[70:230,70:230]=[155,175,195]
  img[100:110,10:20]=[155,175,195]
  face={'box':np.array([80,60,140,180]),'landmarks':np.array([[110,115],[190,115],[150,150],[125,190],[175,190]])}
  e=KoreanBeautyEngine();m=e.generate_anatomical_masks(img,[face],np.zeros((300,300),np.float32))['colour']
  self.assertGreater(m[150,78],.9)
  self.assertEqual(float(m[150,60]),0.)
  self.assertEqual(float(m[105,15]),0.)
  self.assertEqual(float(m[115,110]),0.)
  self.assertEqual(float(m[190,150]),0.)
  self.assertTrue(np.all(np.isfinite(m)))
 def test_empty_faces_leave_masks_empty(self):
  img=np.zeros((100,100,3),np.uint8)
  masks=KoreanBeautyEngine().generate_anatomical_masks(img,[],np.zeros((100,100),np.float32))
  for m in masks.values():self.assertEqual(np.count_nonzero(m),0)
if __name__=='__main__':unittest.main()
