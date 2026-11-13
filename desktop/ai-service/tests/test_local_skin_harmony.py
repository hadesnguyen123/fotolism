import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.korean_beauty_engine import KoreanBeautyEngine,KoreanBeautyConfig

class LocalSkinHarmonyTests(unittest.TestCase):
 def setUp(self):
  self.engine=KoreanBeautyEngine()
  self.faces=[{'box':np.array([70,20,160,240]),'landmarks':np.array([[115,100],[185,100],[150,155],[120,190],[180,190]])}]
  self.lab=np.full((300,300,3),[190,140,135],np.float32)
  self.skin=np.ones((300,300),np.float32)
  self.lips=np.zeros((300,300),np.float32)
 def test_uniform_skin_is_unchanged(self):
  before=self.lab.copy()
  self.engine.harmonize_local_skin(self.lab,self.faces,self.skin,self.lips)
  np.testing.assert_allclose(self.lab,before,atol=.001)
 def test_local_darkness_is_lifted_with_bounded_colour_change(self):
  self.lab[140:160,225:245]=[170,135,140]
  self.lab[140:160,55:75]=[170,135,140]
  self.lab[170:185,138:162]=[175,144,138]
  before=self.lab.copy()
  delta=self.engine.harmonize_local_skin(self.lab,self.faces,self.skin,self.lips)
  self.assertEqual(float(delta[150,235,0]),0.)
  self.assertGreater(float(delta[178,150,0]),0.)
  self.assertLessEqual(float(delta[...,0].max()),5.001)
  self.assertLessEqual(float(np.abs(delta[...,1:]).max()),3.001)
  np.testing.assert_array_equal(self.lab[:80],before[:80])
 def test_lips_and_outside_skin_are_protected(self):
  self.lab[170:190,135:165]=[160,160,140]
  self.lips[170:190,135:165]=1
  self.skin[:,:80]=0
  before=self.lab.copy()
  self.engine.harmonize_local_skin(self.lab,self.faces,self.skin,self.lips)
  np.testing.assert_array_equal(self.lab[170:190,135:165],before[170:190,135:165])
  np.testing.assert_array_equal(self.lab[:,:80],before[:,:80])
 def test_guided_base_does_not_replace_dark_strip_with_bright_neighbours(self):
  patch=np.full((80,80,3),[198,140,135],np.float32)
  patch[35:45,20:60,0]=180
  confidence=np.ones((80,80),np.float32)
  confidence[45:]=0
  base=self.engine.skin_guided_base(patch,confidence,8)
  self.assertLess(float(base[40,40,0]),185.)
  self.assertGreater(float(base[20,40,0]),195.)
 def test_v2_harmonizes_before_blush(self):
  events=[]
  engine=KoreanBeautyEngine()
  engine.detect_faces=lambda _image:self.faces
  engine.detect_dense_landmarks=lambda *args,**kwargs:None
  original_harmony=engine.harmonize_local_skin
  original_connected=engine.harmonize_connected_skin
  original_blush=engine.apply_rosy_blush
  original_fill=engine.lift_outer_cheeks
  def connected(*args):
   events.append('connected');return original_connected(*args)
  def harmony(*args):
   events.append('harmony');return original_harmony(*args)
  def blush(*args):
   events.append('blush');return original_blush(*args)
  def fill(*args):
   events.append('fill');return original_fill(*args)
  engine.harmonize_local_skin=harmony
  engine.harmonize_connected_skin=connected
  engine.apply_rosy_blush=blush
  engine.lift_outer_cheeks=fill
  import cv2
  image=cv2.cvtColor(self.lab.astype(np.uint8),cv2.COLOR_LAB2BGR)
  engine.process_image(image,KoreanBeautyConfig.white_pink_v2())
  self.assertEqual(events,['harmony','fill','blush'])
 def test_lip_refinement_keeps_philtrum_skin_available(self):
  import cv2
  lab=self.lab.copy();lab[192:215,130:170]=[160,162,135]
  image=cv2.cvtColor(lab.astype(np.uint8),cv2.COLOR_LAB2BGR)
  masks=self.engine.generate_anatomical_masks(image,self.faces,np.zeros((300,300),np.float32),continuous_skin=True)
  self.assertGreater(float(masks['colour'][180,150]),.9)
  self.assertLess(float(masks['lip'][180,150]),.05)
  self.assertGreater(float(masks['lip'][202,150]),.9)
  self.assertLess(float(masks['colour'][202,150]),.1)
 def test_connected_chroma_field_preserves_shading_and_protected_regions(self):
  self.lab[130:175,225:245]=[170,135,140]
  self.lab[130:175,55:75]=[175,135,140]
  self.skin[:,:45]=0;self.skin[:,255:]=0
  self.lips[185:215,125:175]=1
  before=self.lab.copy()
  delta=self.engine.harmonize_connected_skin(self.lab,self.faces,self.skin,self.lips)
  self.assertGreater(float(delta[150,235,1]),.2)
  self.assertGreater(float(delta[150,65,1]),.2)
  self.assertLess(float(delta[150,235,2]),-.2)
  np.testing.assert_array_equal(self.lab[...,0],before[...,0])
  np.testing.assert_array_equal(self.lab[:,:45],before[:,:45])
  np.testing.assert_array_equal(self.lab[185:215,125:175],before[185:215,125:175])
  self.assertLessEqual(float(np.abs(delta).max()),4.001)
 def test_connected_chroma_field_does_not_double_overlapping_faces(self):
  self.lab[130:175,225:245,1]=135
  once=self.lab.copy();twice=self.lab.copy()
  self.engine.harmonize_connected_skin(once,self.faces,self.skin,self.lips)
  self.engine.harmonize_connected_skin(twice,self.faces*2,self.skin,self.lips)
  np.testing.assert_allclose(once,twice,atol=.001)
 def test_connected_chroma_skips_missing_skin_references(self):
  before=self.lab.copy()
  self.engine.harmonize_connected_skin(self.lab,self.faces,np.zeros_like(self.skin),self.lips)
  np.testing.assert_array_equal(self.lab,before)
 def test_outer_fill_preserves_mid_face_texture_and_natural_shadow(self):
  self.lab[130:175,225:245,0]=170
  self.skin[:,:45]=0
  self.lips[185:215,125:175]=1
  before=self.lab.copy()
  lift=self.engine.lift_outer_cheeks(self.lab,self.faces,self.skin,self.lips)
  self.assertGreater(float(lift[150,235]),.5)
  self.assertLessEqual(float(lift.max()),2.501)
  self.assertLess(float(self.lab[150,235,0]),175.)
  np.testing.assert_array_equal(self.lab[...,1:],before[...,1:])
  np.testing.assert_array_equal(self.lab[:,125:175],before[:,125:175])
  np.testing.assert_array_equal(self.lab[:,:45],before[:,:45])
 def test_larger_colour_deviation_gets_stronger_relative_correction(self):
  ratios=[]
  for deviation in (1.,3.):
   lab=self.lab.copy();lab[130:175,225:245,1]-=deviation
   delta=self.engine.harmonize_connected_skin(lab,self.faces,self.skin,self.lips)
   ratios.append(float(delta[150,235,1])/deviation)
  self.assertGreater(ratios[1],ratios[0]+.02)
if __name__=='__main__':unittest.main()
