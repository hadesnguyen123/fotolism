import sys,inspect,unittest
from pathlib import Path
from unittest.mock import patch
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.korean_beauty_engine import KoreanBeautyEngine,KoreanBeautyConfig

class V2RevisionTests(unittest.TestCase):
 def test_jaw_displacement_rotates_with_face_axis(self):
  engine=KoreanBeautyEngine();image=np.full((400,400,3),(160,180,200),np.uint8)
  original=np.array([[150,110],[250,110],[200,180],[165,225],[235,225]],np.float32)
  for degrees in (-25.,0.,25.):
   a=np.deg2rad(degrees);rotation=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]],np.float32)
   points=(original-[200,200])@rotation.T+[200,200]
   face={'box':np.array([90,65,220,270]),'landmarks':points}
   captured={}
   def remap(im,mx,my,*args,**kwargs):
    captured.update(x=mx,y=my);return im.copy()
   with patch.object(cv2,'remap',side_effect=remap):
    engine.apply_subtle_reshaping(image,[face],slim_face=.06,big_eyes=0,slim_nose=0,pose_aware=True)
   yy,xx=np.mgrid[:400,:400]
   dx=captured['x']-xx;dy=captured['y']-yy
   along_down=dx*rotation[0,1]+dy*rotation[1,1]
   self.assertLess(float(np.abs(along_down).max()),.0001)
   self.assertGreater(float(np.hypot(dx,dy).max()),.5)
 def test_unreliable_yaw_skips_jaw_warp(self):
  image=np.full((300,300,3),(160,180,200),np.uint8)
  face={'box':np.array([60,30,180,230]),'landmarks':np.array([[100,80],[200,80],[245,150],[160,190],[220,190]],np.float32)}
  output,mask=KoreanBeautyEngine().apply_subtle_reshaping(image,[face],slim_face=.06,big_eyes=0,slim_nose=0,pose_aware=True)
  np.testing.assert_array_equal(output,image)
  self.assertEqual(float(mask.max()),0.)
 def test_smoothing_preserves_rgb_chroma_and_continuous_field_is_disabled(self):
  rng=np.random.default_rng(4)
  image=np.clip(np.full((300,300,3),(160,180,200),np.int16)+rng.integers(-8,9,(300,300,3)),0,255).astype(np.uint8)
  face={'box':np.array([70,20,160,240]),'landmarks':np.array([[115,100],[185,100],[150,155],[120,190],[180,190]],np.int32),'conf':.95}
  engine=KoreanBeautyEngine();engine.detect_faces=lambda _image:[face]
  engine.detect_dense_landmarks=lambda *args,**kwargs:None
  engine.harmonize_connected_skin=lambda *args:(_ for _ in ()).throw(AssertionError('Disabled field was invoked'))
  lines,start=inspect.getsourcelines(KoreanBeautyEngine._process_core)
  target=next(start+i for i,line in enumerate(lines) if line.strip().startswith('gray_bl ='))
  saved={}
  def tracer(frame,event,arg):
   if frame.f_code.co_name!='_process_core':return None
   if event=='line' and frame.f_lineno==target:
    saved['delta']=frame.f_locals['blended'].astype(int)-frame.f_locals['proc_img'].astype(int)
   return tracer
  previous=sys.gettrace();sys.settrace(tracer)
  try:engine.process_image(image,KoreanBeautyConfig.white_pink_v2())
  finally:sys.settrace(previous)
  delta=saved['delta']
  np.testing.assert_array_equal(delta[...,0],delta[...,1])
  np.testing.assert_array_equal(delta[...,1],delta[...,2])
  self.assertGreater(int(np.abs(delta).max()),0)
  self.assertLessEqual(int(np.abs(delta).max()),6)
 def test_dense_jaw_warp_uses_rotated_chin_and_preserves_neck(self):
  oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
  points=np.tile(np.array([[200.,200.]],np.float32),(478,1))
  for idx,angle in zip(oval,np.linspace(-np.pi/2,3*np.pi/2,len(oval),endpoint=False)):
   points[idx]=[200+85*np.cos(angle),200+110*np.sin(angle)]
  points[33]=[155,160];points[133]=[175,160];points[362]=[225,160];points[263]=[245,160];points[2]=[200,220]
  yy,xx=np.mgrid[:400,:400]
  for degrees in (-25.,0.,25.):
   a=np.deg2rad(degrees);rotation=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]],np.float32)
   dense=(points-[200,200])@rotation.T+[200,200]
   mx=xx.astype(np.float32);my=yy.astype(np.float32)
   KoreanBeautyEngine.apply_dense_jaw_mapping(mx,my,dense,.06)
   dx=mx-xx;dy=my-yy;down=rotation[:,1]
   self.assertLess(float(np.abs(dx*down[0]+dy*down[1]).max()),.0001)
   self.assertGreater(float(np.hypot(dx,dy).max()),.5)
   chin=dense[152];below=(xx-chin[0])*down[0]+(yy-chin[1])*down[1]>2
   self.assertEqual(float(np.hypot(dx,dy)[below].max()),0.)
if __name__=='__main__':unittest.main()
