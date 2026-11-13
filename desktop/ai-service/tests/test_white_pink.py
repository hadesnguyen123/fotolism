import sys,unittest,tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.lut_manager import LUTManager
from core.korean_beauty_engine import KoreanBeautyConfig,KoreanBeautyEngine
import core.korean_beauty_engine as beauty_engine_module
from api.routes.enhance import EnhanceRequest,enhance_image
import cv2

class TestWhitePink(unittest.TestCase):
 def test_dense_landmark_pairing_rejects_unmatched_face(self):
  face={'box':np.array([100,100,80,100]),'landmarks':np.zeros((5,2),np.int32),'conf':.9}
  points=np.zeros((478,2),np.float32);points[:,:]=[500,500]
  self.assertFalse(KoreanBeautyEngine.attach_dense_landmarks([face],[points]))
  self.assertNotIn('dense_landmarks',face)
 def test_dense_landmark_pairing_accepts_overlapping_face(self):
  face={'box':np.array([100,100,100,120]),'landmarks':np.zeros((5,2),np.int32),'conf':.9}
  points=np.tile(np.array([[120.,120.]],np.float32),(478,1))
  points[:20]=[[100.+i,100.+i] for i in range(20)]
  points[20:40]=[[190.+i,190.+i] for i in range(20)]
  self.assertTrue(KoreanBeautyEngine.attach_dense_landmarks([face],[points]))
  self.assertEqual(len(face['dense_landmarks']),478)
 def test_missing_local_dense_model_uses_yunet_fallback(self):
  original=beauty_engine_module.DENSE_MODEL_PATH
  try:
   beauty_engine_module.DENSE_MODEL_PATH=Path('missing-face-landmarker.task')
   self.assertIsNone(KoreanBeautyEngine().detect_dense_landmarks(np.zeros((64,64,3),np.uint8)))
  finally:
   beauty_engine_module.DENSE_MODEL_PATH=original
 def test_under_eye_mask_is_separate_from_eye_region(self):
  image=np.full((150,150,3),(160,180,200),dtype=np.uint8)
  dense=np.tile(np.array([[70.,80.]],dtype=np.float32),(478,1))
  oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
  angles=np.linspace(-np.pi/2,3*np.pi/2,len(oval),endpoint=False)
  for idx,angle in zip(oval,angles): dense[idx]=[70+43*np.cos(angle),80+55*np.sin(angle)]
  dense[33]=[45.,56.]; dense[133]=[64.,56.]
  dense[144]=[48.,60.]; dense[145]=[52.,62.]; dense[153]=[56.,63.]; dense[154]=[60.,62.]; dense[155]=[62.,60.]
  dense[263]=[76.,56.]; dense[362]=[95.,56.]
  dense[373]=[78.,60.]; dense[374]=[82.,62.]; dense[380]=[86.,63.]; dense[381]=[90.,62.]; dense[382]=[93.,60.]
  dense[160]=[50.,53.]; dense[158]=[58.,53.]; dense[153]=[60.,60.]; dense[144]=[48.,60.]
  dense[385]=[80.,53.]; dense[387]=[88.,53.]; dense[380]=[90.,60.]; dense[373]=[78.,60.]
  dense[61]=[62.,88.]; dense[291]=[78.,88.]; dense[10]=[70.,25.]
  face={'box':np.array([27,25,86,110]),'landmarks':np.array([[52,56],[88,56],[70,70],[62,88],[78,88]],dtype=np.int32),'dense_landmarks':dense}
  masks=KoreanBeautyEngine().generate_anatomical_masks(image,[face],np.zeros((150,150),np.float32),protect_glasses=False,collect_debug=True)
  under=masks['under_eye']>25
  eyes=masks['eyes']>.1
  self.assertGreater(int(under.sum()),0)
  self.assertEqual(masks['under_eye'].dtype,np.uint8)
  self.assertLess(float((under & eyes).sum())/max(1,int(under.sum())),.05)
 def test_v2_is_independent_texture_first_preset(self):
  cfg=KoreanBeautyConfig.white_pink_v2()
  self.assertEqual(cfg.presetId,'white_pink_v2')
  self.assertEqual(cfg.skinSmoothing,.70)
  self.assertEqual(cfg.blemishRemoval,.90)
  self.assertEqual(cfg.skinTextureRetention,.90)
  self.assertEqual(cfg.skinEvening,.60)
  self.assertEqual(cfg.rosyTone,.925)
  self.assertEqual(cfg.skinBrightening,.50)
  self.assertEqual(cfg.darkCirclesReduction,.70)
  self.assertEqual(cfg.skinYellowReduction,0.)
  self.assertEqual(cfg.blushSpread,1.30)
  self.assertEqual(cfg.blushAdaptation,.85)
  self.assertEqual(cfg.rosyBlush,.60)
  self.assertEqual(cfg.softGlow,.13)
  self.assertEqual(cfg.lipEnhancement,.47)
  self.assertEqual(cfg.upperLipStrength,.445)
  self.assertEqual(cfg.lipGloss,.90)
  self.assertEqual(cfg.eyeSharpening,.32)
  self.assertEqual(cfg.slimNose,.20)
  self.assertEqual(cfg.bigEyes,.10)
  self.assertEqual(cfg.slimFace,.10)
  self.assertEqual(KoreanBeautyConfig.white_pink().skinSmoothing,1.)
 def test_v2_uses_yunet_geometry_when_dense_is_unavailable(self):
  engine=KoreanBeautyEngine()
  image=np.full((120,160,3),128,dtype=np.uint8)
  face={'box':np.array([35,20,90,100]),'landmarks':np.array([[58,54],[101,54],[80,69],[66,87],[94,87]],dtype=np.int32),'conf':.95}
  engine.detect_faces=lambda _image:[face.copy()]
  engine.detect_dense_landmarks=lambda *args,**kwargs:None
  engine._process_core=lambda _image,faces,_cfg,_clean: (self.assertNotIn('dense_landmarks',faces[0]) or _image.copy())
  result=engine.process_image(image,KoreanBeautyConfig.white_pink_v2())
  self.assertEqual(result.shape,image.shape)
  self.assertEqual(engine.last_timings['dense_face_count'],0)
 def test_v2_dense_landmarks_are_used_for_reshape_only(self):
  engine=KoreanBeautyEngine();image=np.full((120,160,3),128,np.uint8)
  face={'box':np.array([35,20,90,100]),'landmarks':np.array([[58,54],[101,54],[80,69],[66,87],[94,87]],np.int32),'conf':.95}
  points=np.tile(np.array([[80.,70.]],np.float32),(478,1));points[0]=[35,20];points[1]=[125,120]
  engine.detect_faces=lambda _image:[face.copy()]
  engine.detect_dense_landmarks=lambda *args,**kwargs:[points]
  def core(im,faces,cfg,clean):
   self.assertEqual(len(faces[0]['reshape_landmarks']),478)
   self.assertNotIn('dense_landmarks',faces[0])
   return im.copy()
  engine._process_core=core
  engine.process_image(image,KoreanBeautyConfig.white_pink_v2())
  self.assertEqual(engine.last_timings['dense_face_count'],1)
 def test_v2_routes_without_face_safely(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'source.jpg';target=Path(d)/'out.jpg'
   cv2.imwrite(str(source),np.full((120,160,3),128,dtype=np.uint8))
   result=enhance_image(EnhanceRequest(imagePath=str(source),outputPath=str(target),presetId='white_pink_v2',styleId='natural',koreanConfig=KoreanBeautyConfig.white_pink_v2()))
   self.assertTrue(result.success)
   self.assertEqual(result.data.presetId,'white_pink_v2')
 def test_enhance_default_preset_is_v2(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'source.jpg';target=Path(d)/'out.jpg'
   cv2.imwrite(str(source),np.full((120,160,3),128,dtype=np.uint8))
   result=enhance_image(EnhanceRequest(imagePath=str(source),outputPath=str(target),styleId='natural'))
   self.assertTrue(result.success)
   self.assertEqual(result.data.presetId,'white_pink_v2')
 def test_natural_does_not_fall_back_to_test_lut(self):
  with tempfile.TemporaryDirectory() as d:
   lut=np.zeros(256,dtype=np.uint8)
   np.savez(Path(d)/'c1_test_style_lut.npz',lut_b=lut,lut_g=lut,lut_r=lut)
   image=np.full((12,12,3),150,dtype=np.uint8)
   np.testing.assert_array_equal(LUTManager(Path(d)).apply_style(image,'natural'),image)
 def test_white_pink_routes_without_face_safely(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'source.jpg';target=Path(d)/'out.jpg'
   cv2.imwrite(str(source),np.full((120,160,3),128,dtype=np.uint8))
   result=enhance_image(EnhanceRequest(imagePath=str(source),outputPath=str(target),presetId='white_pink',styleId='natural'))
   self.assertTrue(result.success)
   self.assertEqual(result.data.presetId,'white_pink')
   self.assertEqual(cv2.imread(str(target)).shape,(120,160,3))
if __name__=='__main__':unittest.main()
